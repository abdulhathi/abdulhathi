import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { passwordLogin } from '../diagrams/specs/passwords';

const T = '04-passwords';

export function Passwords() {
  return (
    <>
      <ChapterIntro
        time="2.5–3 hours in one stack"
        project={T}
        learn={[
          'Why a password is stored as a slow, salted hash, and what an attacker can do with a leaked one',
          'Choosing between Argon2id, scrypt, bcrypt and PBKDF2, with the settings OWASP recommends',
          'Verifying in constant time, and answering an unknown email exactly like a wrong password',
          'Upgrading old hashes the next time a user signs in',
          'Locking an account after repeated failures, and the password rules NIST actually recommends',
        ]}
        tools={[
          { name: 'Node.js', what: 'scrypt, randomBytes and timingSafeEqual from node:crypto; Express 5.' },
          { name: 'Python', what: 'argon2-cffi (Argon2id) and FastAPI.' },
          { name: '.NET', what: 'ASP.NET Core Identity’s PasswordHasher (PBKDF2-HMAC-SHA512) in a minimal API.' },
        ]}
      />

      <div className="prose">
        <p>
          Every other method in this lab builds on a first sign-in, and most first sign-ins still use a password. Get
          password storage wrong and nothing else matters: a leaked database becomes a list of email and password pairs,
          and because people reuse passwords, those pairs open their email and bank accounts too.
        </p>
        <p>
          So design for the day the database leaks. A backup left in a public bucket, a SQL injection, a stolen laptop:
          the question is what an attacker can do with the <code>users</code> table once they have it.
        </p>
      </div>

      <h2>Hash, salt, and make it slow</h2>
      <div className="prose">
        <p>
          A <strong>hash</strong> is a one-way function: easy to compute from the password, infeasible to reverse. To
          check a sign-in you hash what was typed and compare it with the stored hash. You never need the password
          itself, so you never store it.
        </p>
        <p>
          A plain hash such as SHA-256 is not enough, for two reasons. First, the same password always gives the same
          hash, so an attacker can precompute hashes of common passwords once and look up every user at the same time.
          A <strong>salt</strong> (random bytes, different for every user, stored next to the hash) defeats that: each
          user must be attacked separately. Second, SHA-256 is <em>fast</em>. A single graphics card computes billions
          of SHA-256 hashes a second. A <strong>password hashing function</strong> is deliberately slow and, in the best
          cases, needs a lot of memory, so each guess costs the attacker real time and money.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr><th>Algorithm</th><th>OWASP minimum settings</th><th>Strengths</th><th>Watch out for</th></tr>
        </thead>
        <tbody>
          <tr><td>Argon2id</td><td>19 MiB memory, 2 iterations, 1 lane</td><td>The first choice today: memory-hard, so graphics cards and custom chips gain little</td><td>Needs a library (argon2-cffi, argon2 for Node, Konscious for .NET)</td></tr>
          <tr><td>scrypt</td><td>N = 2<sup>17</sup>, r = 8, p = 1 (about 128 MiB)</td><td>Memory-hard, and built into Node and Python</td><td>Memory use per sign-in: plan the server’s capacity</td></tr>
          <tr><td>bcrypt</td><td>Cost 10 or more</td><td>Battle-tested, everywhere</td><td>Uses only the first 72 bytes of the password; not memory-hard</td></tr>
          <tr><td>PBKDF2</td><td>600,000 iterations with HMAC-SHA256, or 210,000 with HMAC-SHA512</td><td>FIPS-approved; built into .NET and ASP.NET Core Identity</td><td>Not memory-hard; needs the most iterations</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <p>
          The three projects use a different algorithm each, on purpose, so you see each library: scrypt in Node.js
          (no extra package), Argon2id in Python, and PBKDF2 through ASP.NET Core Identity in .NET (what an Identity-based
          app uses by default). All three store the algorithm and its settings inside the hash string, which is what makes
          upgrading possible later.
        </p>
      </div>

      <Diagram spec={passwordLogin} caption="Signing up stores only a salted, slow hash. Signing in hashes the typed password the same way and compares." />

      <Step n={1}>Hash and verify</Step>
      <div className="prose">
        <p>
          Each module has three functions: hash a new password, verify a typed one against the stored hash, and tell
          whether a stored hash was made with weaker settings than today’s. The comparison must take the same time
          whether the first byte or the last byte differs, or an attacker who can time responses learns how close a guess
          was. Node.js does this explicitly with <code>timingSafeEqual</code>; argon2-cffi and Identity do it inside
          their verify call.
        </p>
      </div>
      <StackFiles
        label="Hashing and verifying"
        node={`${T}/node/src/passwords.ts`}
        python={`${T}/python/passwords.py`}
        dotnet={[`${T}/dotnet/Api/PasswordPolicy.cs`, `${T}/dotnet/Api/Users.cs`]}
      />
      <div className="prose">
        <p>
          In .NET there is no hashing file to write: <code>PasswordHasher&lt;TUser&gt;</code> from
          <code> Microsoft.Extensions.Identity.Core</code> does it, configured in <code>Program.cs</code> below. Its
          <code> VerifyHashedPassword</code> returns <code>Success</code>, <code>Failed</code>, or
          <code> SuccessRehashNeeded</code>, which is the rehash check built in.
        </p>
        <p>The stored values look like this (shortened):</p>
      </div>
      <Output
        caption="What a stored hash looks like in each project"
        panes={[
          { tag: 'Node.js (scrypt)', text: 'scrypt$131072$8$1$3q0tW1q2…==$Qm9v1x8…=' },
          { tag: 'Python (Argon2id)', text: '$argon2id$v=19$m=19456,t=2,p=1$cHJ0c2FsdA$9b8l…' },
          { tag: '.NET (Identity v3)', text: 'AQAAAAIAAzQQAAAAEP3m…  (base64: format, PRF, iterations, salt, hash)' },
        ]}
      />
      <Box kind="key" label="Password rules that help">
        <p>
          NIST SP 800-63B asks for length, not complexity: at least 8 characters (these projects ask for 12), allow at
          least 64, accept spaces and any character, and reject passwords known to be common or breached. Do not force
          symbols and digits, and do not force regular changes: both push people toward predictable patterns. A real
          service checks a breached-password list such as Have I Been Pwned’s range API instead of the tiny set here.
        </p>
      </Box>

      <Step n={2}>Slow down guessing: lock after repeated failures</Step>
      <div className="prose">
        <p>
          Slow hashing protects a leaked database. Online guessing against your sign-in endpoint needs a limit too.
          These projects lock an account for 15 minutes after 5 failures in a row and answer <code>429 Too Many
          Requests</code> with a <code>Retry-After</code> header. A success clears the count. Each takes a clock as a
          parameter, so the tests can move time forward instead of waiting 15 minutes.
        </p>
      </div>
      <StackFiles
        label="The failed sign-in limiter"
        node={`${T}/node/src/limiter.ts`}
        python={`${T}/python/limiter.py`}
        dotnet={`${T}/dotnet/Api/LoginLimiter.cs`}
      />
      <Box kind="warn" label="Lockout can be used against your users">
        <p>
          Anyone who knows an email can lock that account by failing five times. Real services soften this: they count
          failures per account <em>and</em> per IP address, slow down progressively instead of locking hard, require a
          CAPTCHA or a second factor after a few failures, and email the user. Keep the counts in Redis or the database so
          every server instance shares them.
        </p>
      </Box>

      <Step n={3}>The sign-up and sign-in endpoints</Step>
      <div className="prose">
        <p>Three details in the sign-in handler matter more than they look:</p>
        <ul>
          <li>
            <strong>The same answer for an unknown email and a wrong password.</strong> Different messages, or different
            status codes, tell an attacker which emails have accounts.
          </li>
          <li>
            <strong>The same time, too.</strong> If an unknown email returned instantly while a known one took 100 ms to
            hash, the timing would leak the same thing. So an unknown email is checked against a dummy hash made at
            start-up.
          </li>
          <li>
            <strong>Rehash on success.</strong> The only moment you have the plain password is at sign-in. If the stored
            hash used weaker settings than today’s, replace it then. Raising the cost later upgrades every active user
            without a migration.
          </li>
        </ul>
      </div>
      <StackFiles
        label="The sign-up and sign-in endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={`${T}/python/app.py`}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="tip" label="Sign-up can leak accounts too">
        <p>
          Answering <code>409 That email is already registered</code> tells anyone which emails have accounts. It is a
          common, accepted trade-off for usability. Where it matters (a dating site, a clinic), answer every sign-up with
          “Check your email to continue” and send either a welcome link or an “you already have an account” notice.
        </p>
      </Box>

      <Step n={4}>Run the tests</Step>
      <div className="prose">
        <p>
          Each project tests the same behaviour: the right password works, a wrong one fails, hashes are salted, a weak
          hash is upgraded, an unknown email looks like a wrong password, a request with missing fields gets the normal
          answer rather than a server error, and five failures lock the account until the clock moves on. The tests use a cheap hashing cost so they finish in seconds; the app uses the real one.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/passwords.test.ts`, `${T}/node/test/app.test.ts`]}
        python={[`${T}/python/test_passwords.py`, `${T}/python/test_app.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/PasswordTests.cs`, `${T}/dotnet/Api.Tests/LoginTests.cs`]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 10\nℹ pass 10\nℹ fail 0' },
          { tag: 'Python', text: '..........               [100%]\n10 passed' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 10, Skipped: 0, Total: 10' },
        ]}
      />

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <Output caption="The same session against each server (all three answer identically)">{`
$ curl -s -X POST localhost:3000/signup -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}'
{"email":"ada@example.com"}
$ curl -s -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}'
{"email":"ada@example.com","message":"Signed in."}
$ curl -s -i -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"wrong horse battery"}'
HTTP/1.1 401 Unauthorized
{"error":"Email or password is incorrect."}
`}</Output>
      <div className="prose">
        <p>
          A successful sign-in here only says “Signed in.” Remembering the user on the next request is the job of the
          next chapters: a session cookie (chapter 05) or a token (chapter 08).
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>MD5, SHA-1 or SHA-256 of the password</td><td>Billions of guesses a second on one graphics card</td><td>Argon2id, scrypt, bcrypt or PBKDF2 with OWASP settings</td></tr>
          <tr><td>One salt for everyone, or none</td><td>One precomputed table cracks every user</td><td>A random salt per hash (the libraries do this)</td></tr>
          <tr><td>Comparing hashes with <code>==</code></td><td>Timing reveals how much of a guess matched</td><td>A constant-time comparison</td></tr>
          <tr><td>Logging request bodies</td><td>Passwords end up in log files and log services</td><td>Redact password fields before logging</td></tr>
          <tr><td>“Wrong password” vs “No such user”</td><td>Lets anyone list which emails have accounts</td><td>One message and one status for both</td></tr>
          <tr><td>bcrypt on long passphrases</td><td>Everything after byte 72 is ignored</td><td>Argon2id, or pre-hash carefully</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="A pepper, for defence in depth">
        <p>
          A <strong>pepper</strong> is a secret added to every password before hashing (usually with HMAC), stored outside
          the database, in a key vault or environment variable. If only the database leaks, the hashes cannot be attacked
          at all without it. The cost: lose the pepper and every password is lost, and rotating it needs a plan.
        </p>
      </Box>

      <Checkpoint question="Why does the sign-in handler check a dummy hash when the email is unknown?">
        <p>
          So that both failure paths take the same time. Without it, an unknown email would return immediately while a
          known one spends about 100 ms hashing, and an attacker could time the responses to learn which emails have
          accounts, even though the message is the same.
        </p>
      </Checkpoint>
      <Checkpoint question="You want to raise scrypt’s N from 2^16 to 2^17. How do existing users get the stronger hash?">
        <p>
          Raise the setting in code. Old hashes still verify, because each stored hash carries its own N. At each user’s
          next successful sign-in, <code>needsRehash</code> sees the lower N and the handler stores a fresh hash made with
          the new setting. Users who never sign in again keep the old hash; force a reset for them if needed.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack from an empty folder, then add a
                <code> POST /change-password</code> endpoint that requires the current password and applies the same
                policy to the new one.
              </>
            ),
            hint: <>Verify the current password with the same function as sign-in, then store a fresh hash of the new one. Return 401 with the same message if the current password is wrong.</>,
          },
          {
            task: <>Count failures per IP address as well as per account, so one attacker spraying many accounts is slowed too.</>,
            hint: <>Key a second limiter by the client IP. In Express read <code>req.ip</code>, in FastAPI <code>request.client.host</code>, in ASP.NET Core <code>HttpContext.Connection.RemoteIpAddress</code>. Behind a proxy, trust its forwarded header only.</>,
          },
          {
            task: <>Check new passwords against Have I Been Pwned’s range API: send the first 5 characters of the password’s SHA-1, and look for the rest in the answer.</>,
            hint: <>GET https://api.pwnedpasswords.com/range/ABCDE returns lines of SUFFIX:COUNT. Only the 5-character prefix leaves your server, so the password stays private (k-anonymity).</>,
          },
          {
            task: <>Switch the Node.js project to Argon2id with the <code>argon2</code> package, keeping existing scrypt hashes working until each user signs in again.</>,
            hint: <>Make verify choose by prefix (<code>scrypt$</code> or <code>$argon2id$</code>), and make <code>needsRehash</code> return true for every scrypt hash.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>Store only a salted, slow password hash: Argon2id first, then scrypt, bcrypt or PBKDF2 with OWASP settings.</li>
          <li>Keep the algorithm and its settings in the stored string, and rehash at sign-in when they get stronger.</li>
          <li>Compare in constant time, and answer an unknown email exactly like a wrong password, in message and in time.</li>
          <li>Limit failed attempts, and ask for long passwords that are not known to be common or breached; skip composition rules.</li>
        </ul>
      </Recap>
    </>
  );
}
