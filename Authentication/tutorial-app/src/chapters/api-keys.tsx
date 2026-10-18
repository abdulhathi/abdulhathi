import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { apiKeyFlow } from '../diagrams/specs/api-keys';

const T = '07-api-keys';

export function ApiKeys() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours in one stack"
        project={T}
        learn={[
          'What an API key is for, and why it identifies an application rather than a person',
          'Making keys from a CSPRNG with a recognizable prefix and an id, and showing each key only once',
          'Storing only a SHA-256 hash, and why a fast hash is right for keys but wrong for passwords',
          'Checking scopes per endpoint, expiry and revocation, and rotating with two keys valid at once',
          'Sending keys in a header (never in the URL), rate limiting each key, and when a key is not enough',
        ]}
        tools={[
          { name: 'Node.js', what: 'randomBytes, createHash and timingSafeEqual from node:crypto; Express 5 middleware and a Router.' },
          { name: 'Python', what: 'secrets, hashlib and hmac.compare_digest; FastAPI dependencies with HTTPBearer and APIKeyHeader.' },
          { name: '.NET', what: 'A custom AuthenticationHandler for an ApiKey scheme, one authorization policy per scope, and RandomNumberGenerator.' },
        ]}
      />

      <div className="prose">
        <p>
          When a program calls your API, there is nobody to type a password or click through a sign-in page. A nightly
          export job, a partner’s server, a build pipeline: each needs a credential it can send on its own. The simplest one
          is an <strong>API key</strong>: a long random string you give to that program. It sends the key with every
          request, and your server looks the key up to learn which client is calling and what it may do.
        </p>
        <p>
          API keys are everywhere (payment providers, email services, map and AI APIs) because they are easy to issue and
          easy to use. They are also easy to get wrong. An API key is a <strong>bearer credential</strong>: whoever holds
          it can use it, no questions asked. Keys live for months, they end up in configuration files and CI variables, and
          too often in public repositories. This chapter builds the parts that make keys safe to hand out: unguessable
          keys, hashed storage, scopes, expiry, revocation, rotation and rate limits.
        </p>
      </div>

      <h2>What a key looks like</h2>
      <div className="prose">
        <p>
          The keys in this chapter look like <code>ak_live_3908ccca083a_ve2SmAjoHy0mzPc1kuL-yHknZerwyQKgv3OhhYwY69k</code>.
          Each part has a job:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>Example</th><th>Why it is there</th></tr>
        </thead>
        <tbody>
          <tr><td>Prefix</td><td><code>ak_live_</code></td><td>People and tools can tell what the string is. A secret scanner can only find keys whose pattern it knows: register your prefix with GitHub’s secret scanning partner program (or add it as a custom pattern in your own scanner), and a key pushed to a repository is reported to you. A separate <code>ak_test_</code> prefix keeps test keys from being mistaken for live ones.</td></tr>
          <tr><td>Key id</td><td><code>3908ccca083a</code></td><td>12 hex characters that name the key. They are not secret: they appear in logs and dashboards, and the server uses them to find the key’s record without searching by the secret.</td></tr>
          <tr><td>Secret</td><td><code>ve2SmAjo…Y69k</code></td><td>32 random bytes (256 bits) from a CSPRNG, written in base64url (43 characters). This is the part that makes the key impossible to guess.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A <strong>CSPRNG</strong> (cryptographically secure pseudo-random number generator) produces numbers that cannot
          be predicted, even by someone who has seen earlier output. <code>Math.random()</code>, Python’s{' '}
          <code>random</code> module and .NET’s <code>System.Random</code> are not CSPRNGs; their output can be predicted.
          Use <code>crypto.randomBytes</code> in Node.js, the <code>secrets</code> module in Python, and{' '}
          <code>RandomNumberGenerator</code> in .NET.
        </p>
      </div>

      <h2>How a key is issued and checked</h2>
      <div className="prose">
        <p>
          An admin creates a key for a client and chooses its <strong>scopes</strong>: the names of the things it may do,
          such as <code>reports:read</code>. The server makes the key, stores a hash of it, and shows the key once. On every
          request the server reads the id out of the key, finds the record, compares hashes, and then checks expiry, the
          rate limit and the scope this endpoint needs.
        </p>
      </div>
      <Diagram spec={apiKeyFlow} caption="The key is shown once and stored as a hash. Each request is checked in order: a working key, its rate limit, then the scope the endpoint needs." />

      <TableWrap>
        <thead>
          <tr><th>Credential</th><th>Identifies</th><th>Typical lifetime</th><th>What the server stores</th></tr>
        </thead>
        <tbody>
          <tr><td>Password (chapter 04)</td><td>A person</td><td>Years</td><td>A slow, salted hash (Argon2id, scrypt, bcrypt, PBKDF2)</td></tr>
          <tr><td>API key (this chapter)</td><td>An application or integration</td><td>Months, with an expiry</td><td>A fast hash (SHA-256), scopes, expiry</td></tr>
          <tr><td>Signed request (chapter 10)</td><td>Whoever holds a shared secret</td><td>The secret lasts months; each signature minutes</td><td>The secret itself, so it can recompute signatures</td></tr>
          <tr><td>OAuth access token (chapter 11)</td><td>An app, often acting for a user</td><td>Minutes</td><td>Nothing (a signed JWT) or a token record</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Generate keys, store only a hash, and verify</Step>
      <div className="prose">
        <p>
          The store has five operations: issue, verify, revoke, rotate, and look up by id. Four details carry the
          security:
        </p>
        <ul>
          <li>
            <strong>Only a hash is stored.</strong> The record holds SHA-256 of the whole key, never the key. If the
            database or a backup leaks, the attacker gets hashes that cannot be turned back into working keys.
          </li>
          <li>
            <strong>Look up by id, compare in constant time.</strong> The id inside the key finds the record directly.
            Then the hashes are compared with <code>timingSafeEqual</code>, <code>hmac.compare_digest</code> or{' '}
            <code>CryptographicOperations.FixedTimeEquals</code>, which take the same time wherever the first difference
            is. With a hash in between, timing leaks very little anyway, but the constant-time call costs nothing and
            means nobody has to reason about it.
          </li>
          <li>
            <strong>One answer for every bad key.</strong> A malformed key, an unknown id and a wrong secret all get{' '}
            <code>Invalid API key.</code> Only after the secret matches does the server say that a key was revoked or has
            expired. A legitimate client needs that hint to fix its setup; a stranger learns nothing from it.
          </li>
          <li>
            <strong><code>lastUsedAt</code> is recorded.</strong> It shows which keys are never used, so they can be
            deleted, and it is the first thing to check after a suspected leak.
          </li>
        </ul>
      </div>
      <StackFiles
        label="Issuing, hashing and verifying keys"
        node={`${T}/node/src/keys.ts`}
        python={`${T}/python/keys.py`}
        dotnet={`${T}/dotnet/Api/ApiKeys.cs`}
      />
      <Box kind="key" label="Why SHA-256 is right here, and wrong for passwords">
        <p>
          Chapter 04 says never to store passwords with a fast hash. The difference is where the secret comes from. People
          choose passwords from a small, guessable space, so an attacker with a leaked hash tries the likely ones first,
          billions a second; a slow hash makes each guess expensive. An API key’s secret is 256 random bits. There is no
          “likely” key to try first: even at a trillion guesses a second, the expected time to find one is far longer
          than the age of the universe. A slow hash would add no safety and would cost 50 to 100 ms on every API call,
          which is a denial-of-service attack you wrote yourself.
        </p>
        <p>
          NIST SP 800-63B draws the same line for its look-up secrets: a secret made by an approved random generator with
          at least 112 bits of entropy may be stored with a plain approved hash such as SHA-256, while a shorter one needs
          the salted, slow treatment of a password. The rule holds only for keys you generate. If you ever import keys
          that people chose, treat them like passwords.
        </p>
      </Box>
      <Box kind="tip" label="Show the key once, and make that clear">
        <p>
          The <code>POST /keys</code> response is the only moment the plain key exists outside the client. Say so in the
          response, as these projects do, and in the UI. A client that loses its key gets a new one; nobody can recover
          the old one, including you. Dashboards can show the id and the creation date, which is enough to tell keys
          apart.
        </p>
      </Box>

      <Step n={2}>Limit each key’s request rate</Step>
      <div className="prose">
        <p>
          A leaked or buggy client can flood your API. Each key gets its own budget: here, at most 60 requests in each
          one-minute window. Past that the server answers <code>429 Too Many Requests</code> with a{' '}
          <code>Retry-After</code> header saying how many seconds until the next window. The count is per key, not per IP
          address: many clients can share one address behind a NAT, and one client can call from many addresses.
        </p>
        <p>
          Only requests with a working key reach this counter. Requests with no key, or a wrong one that still costs a
          SHA-256 and a lookup, are not counted at all, so limit them per IP address in front of the API too (a reverse
          proxy, gateway or WAF).
          OWASP’s API Security Top 10 lists missing limits as API4:2023, Unrestricted Resource Consumption.
        </p>
        <p>
          This is a <strong>fixed window</strong>: a counter that resets at the start of every minute. It is the simplest
          limiter, and its known weakness is that a client can send a full window’s worth just before the boundary and
          another just after. A token bucket or sliding window smooths that out (see the exercises). Like the lockout in
          chapter 04, each limiter takes a clock, so the tests move time forward instead of waiting.
        </p>
      </div>
      <StackFiles
        label="A fixed-window rate limiter"
        node={`${T}/node/src/limiter.ts`}
        python={`${T}/python/limiter.py`}
        dotnet={`${T}/dotnet/Api/FixedWindowLimiter.cs`}
      />
      <Box kind="tip" label="Ready-made limiters">
        <p>
          In production, counters live in Redis so every server instance shares them, or an API gateway enforces quotas
          per key. Libraries exist too: <code>express-rate-limit</code> with a <code>keyGenerator</code> that returns the
          key id, <code>slowapi</code> for FastAPI with a <code>key_func</code>, and ASP.NET Core’s built-in rate limiting
          middleware with a <code>PartitionedRateLimiter</code> partitioned by the key id. These projects write their own
          so all three stacks behave the same and the tests can control the clock.
        </p>
      </Box>

      <Step n={3}>Authenticate every request: header, rate limit, scope</Step>
      <div className="prose">
        <p>The check that runs before each protected endpoint does these things, in this order:</p>
        <ol>
          <li>
            <strong>Refuse a key in the URL.</strong> A request with <code>?api_key=</code> gets <code>400</code>. URLs are
            written to web server and proxy logs, kept in browser history, sent to other sites in the{' '}
            <code>Referer</code> header, and pasted into chat and tickets. Treat a key that has been in a URL as leaked
            and rotate it.
          </li>
          <li>
            <strong>Read the key from a header.</strong> <code>Authorization: Bearer &lt;key&gt;</code> is the usual
            choice (the Bearer scheme comes from RFC 6750, written for OAuth tokens, and many APIs use it for keys).{' '}
            <code>X-API-Key: &lt;key&gt;</code> is the other common one. These projects accept both. No key at all is{' '}
            <code>401</code> with <code>WWW-Authenticate: Bearer</code>. HTTP requires a <code>WWW-Authenticate</code>{' '}
            header on every 401 (RFC 9110); it names the scheme the client should use.
          </li>
          <li>
            <strong>Verify the key</strong> with the store from step 1: <code>401</code> with the reason if it fails,
            and <code>WWW-Authenticate: Bearer error="invalid_token"</code>.
          </li>
          <li><strong>Count the request</strong> against that key’s rate limit: <code>429</code> past the limit.</li>
          <li>
            <strong>Check the scope</strong> this endpoint needs: <code>403</code> if the key lacks it, with{' '}
            <code>WWW-Authenticate: Bearer error="insufficient_scope", scope="keys:manage"</code>. A working key with the
            wrong scope is a different problem from no key, which is why it is 403 and not 401. The{' '}
            <code>error</code> values come from RFC 6750, so OAuth client libraries understand them; chapters 08 and 11
            send the same ones for tokens.
          </li>
        </ol>
        <p>Each framework has its own place for this check:</p>
      </div>
      <ByStack
        label="Where the key check lives in each framework"
        node={
          <div className="prose">
            <p>
              In Express it is middleware. <code>apiKeyAuth(store, limiter)</code> returns <code>requireScope(scope)</code>,
              which makes a middleware for one scope. It either answers with an error or puts the key’s record in{' '}
              <code>res.locals.apiKey</code> and calls <code>next()</code>, so the handler knows which client called.
            </p>
          </div>
        }
        python={
          <div className="prose">
            <p>
              In FastAPI it is a dependency. <code>require_scope(scope)</code> returns an async function that FastAPI runs
              before the endpoint. <code>HTTPBearer</code> and <code>APIKeyHeader</code> read the two headers and add an
              “Authorize” button to the generated <code>/docs</code> page; <code>auto_error=False</code> lets the
              dependency write its own errors. It raises <code>Refused</code>, and one exception handler turns that into{' '}
              <code>{'{"error": …}'}</code> with the right status. The dependency and the routes are both in{' '}
              <code>app.py</code>:
            </p>
          </div>
        }
        dotnet={
          <div className="prose">
            <p>
              ASP.NET Core splits it in two, the way its own schemes (cookies, JWT bearer) work. <strong>Authentication</strong>{' '}
              is a custom <code>AuthenticationHandler</code> for an <code>ApiKey</code> scheme: it verifies the key and turns
              it into a <code>ClaimsPrincipal</code> with one <code>scope</code> claim per scope, and its{' '}
              <code>HandleChallengeAsync</code> writes the 401 (or 400) body. <strong>Authorization</strong> is one policy per
              scope (<code>RequireClaim("scope", "reports:read")</code>), and <code>ScopeFailureHandler</code> writes the 403
              body naming the missing scope. The rate limit is a small middleware between the two, in{' '}
              <code>Program.cs</code> (step 4).
            </p>
          </div>
        }
      />
      <StackFiles
        label="The key check"
        node={`${T}/node/src/auth.ts`}
        python={`${T}/python/app.py`}
        dotnet={[`${T}/dotnet/Api/ApiKeyHandler.cs`, `${T}/dotnet/Api/ScopeFailureHandler.cs`]}
      />

      <Step n={4}>The endpoints: create, revoke and rotate keys</Step>
      <div className="prose">
        <p>
          <code>GET /reports</code> is what a client calls; it needs <code>reports:read</code>. Everything under{' '}
          <code>/keys</code> needs <code>keys:manage</code>, and each framework protects the whole group at once: an
          Express <code>Router</code> with one middleware, a FastAPI <code>APIRouter</code> with one dependency, and an
          ASP.NET Core <code>MapGroup</code> with one policy.
        </p>
        <ul>
          <li>
            <strong><code>POST /keys</code></strong> takes a name, a non-empty list of known scopes and{' '}
            <code>expiresInDays</code> (1 to 365, default 90), and answers <code>201</code> with the key, once. A field
            of the wrong type, such as <code>"expiresInDays": "30"</code> or <code>true</code>, is refused in every stack
            but by different code: Express answers <code>400</code> with the message for that field, FastAPI’s model
            validation answers <code>422</code> with its own <code>detail</code> list (the model uses{' '}
            <code>StrictInt</code>, so <code>true</code> does not quietly become 1), and ASP.NET Core’s JSON binding
            answers <code>400</code> with an empty body.
          </li>
          <li>
            <strong><code>POST /keys/&#123;id&#125;/revoke</code></strong> stops a key on its next request. Revoke at once
            when a key may have leaked.
          </li>
          <li>
            <strong><code>POST /keys/&#123;id&#125;/rotate</code></strong> makes a new key with the same name, scopes and
            lifetime (the record keeps the lifetime it was issued with, so rotating the same key twice still gives a
            full-length key), and cuts the old key’s expiry to 24 hours from now. For that day <strong>both keys work</strong>, so
            a client running on many servers can switch over one server at a time. Then the old key stops by itself; nobody
            has to remember to revoke it.
          </li>
        </ul>
        <p>
          The server also prints a first admin key at start-up so you can try the API. A real service makes that first key
          with a deployment script or a command-line tool and puts it straight into a secret store.
        </p>
      </div>
      <StackFiles
        label="The endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={`${T}/python/server.py`}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="warn" label="When an API key is not enough">
        <p>
          An API key says <em>which application</em> is calling. It says nothing about which person is using that
          application, it cannot ask for a second factor, and anyone who copies it can use it from anywhere until it
          expires or is revoked. Use something else when:
        </p>
        <ul>
          <li>
            <strong>The caller is your own browser or mobile app.</strong> Anything shipped to a device can be read out of
            it. Sign users in instead, with a session cookie (chapter 05) or OAuth with PKCE (chapter 11). Keys that are
            meant to be public, such as a map provider’s browser key locked to your domain, are identifiers, not secrets.
          </li>
          <li>
            <strong>You need to know which person acted</strong>, for an audit trail or per-user permissions. Use sign-in
            (OpenID Connect, chapter 12) and tokens issued to that user. A personal access token is an API key tied to one
            user, scoped down, which works for a person’s own scripts.
          </li>
          <li>
            <strong>The stakes are high</strong> (payments, health data). Prefer short-lived tokens from OAuth client
            credentials (chapter 11), client certificates (chapter 17), or signed requests where the secret never travels
            (chapter 10).
          </li>
        </ul>
      </Box>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          Each project tests the same twelve cases: the key format, that only a hash is stored, one answer for every bad
          key, the fixed window and its wait time, then over HTTP: create and use a key (with either header), refuse a
          missing key, a wrong key and a key in the URL (with their challenge headers), 403 for a missing scope, input
          checks, expiry and revocation (where a wrong secret still gets only <code>Invalid API key.</code>), rotation
          with an overlap and a full-length new key, and a separate rate limit per key with the right{' '}
          <code>Retry-After</code>.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/keys.test.ts`, `${T}/node/test/app.test.ts`]}
        python={[`${T}/python/test_keys.py`, `${T}/python/test_app.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/KeyTests.cs`, `${T}/dotnet/Api.Tests/ApiTests.cs`]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 12\nℹ pass 12\nℹ fail 0' },
          { tag: 'Python', text: '............             [100%]\n12 passed, 1 warning in 0.13s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    12, Skipped:     0, Total:    12' },
        ]}
      />

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn server:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <Output caption="The server prints its first admin key, once">{`
Admin key (shown once): ak_live_f844b6f3abec_wKlNh5gs0GVOIglMZVdLhey3itC49ETtfQRwQotWHkw
`}</Output>
      <div className="prose">
        <p>
          In a second terminal, use that admin key to create a key for a client, call the API with it, then try the
          mistakes. The <code>-w ' [%&#123;http_code&#125;]\n'</code> option makes curl print the status after each body.
        </p>
      </div>
      <Output caption="The same session against each server (all three answer identically; the keys and ids are random)">{`
$ ADMIN=ak_live_f844b6f3abec_wKlNh5gs0GVOIglMZVdLhey3itC49ETtfQRwQotWHkw
$ curl -s -X POST localhost:3000/keys -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d '{"name":"nightly-export","scopes":["reports:read"],"expiresInDays":30}' -w ' [%{http_code}]\\n'
{"id":"3908ccca083a","key":"ak_live_3908ccca083a_ve2SmAjoHy0mzPc1kuL-yHknZerwyQKgv3OhhYwY69k","name":"nightly-export","scopes":["reports:read"],"expiresAt":"2026-11-17T04:23:26Z","note":"Copy this key now: it is shown only once."} [201]
$ KEY=ak_live_3908ccca083a_ve2SmAjoHy0mzPc1kuL-yHknZerwyQKgv3OhhYwY69k
$ curl -s localhost:3000/reports -H "Authorization: Bearer $KEY" -w ' [%{http_code}]\\n'
{"client":"nightly-export","reports":[{"month":"2026-09","orders":1520},{"month":"2026-10","orders":1710}]} [200]
$ curl -s localhost:3000/reports -H "X-API-Key: $KEY" -w ' [%{http_code}]\\n'
{"client":"nightly-export","reports":[{"month":"2026-09","orders":1520},{"month":"2026-10","orders":1710}]} [200]
$ curl -s "localhost:3000/reports?api_key=$KEY" -w ' [%{http_code}]\\n'
{"error":"Send the API key in a header, never in the URL."} [400]
$ curl -s localhost:3000/reports -H "Authorization: Bearer \${KEY%?}x" -w ' [%{http_code}]\\n'
{"error":"Invalid API key."} [401]
$ curl -s -X POST localhost:3000/keys -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"name":"sneaky","scopes":["keys:manage"]}' -w ' [%{http_code}]\\n'
{"error":"This key lacks the keys:manage scope."} [403]
$ curl -s -X POST localhost:3000/keys/3908ccca083a/revoke -H "Authorization: Bearer $ADMIN" -w ' [%{http_code}]\\n'
{"id":"3908ccca083a","revoked":true} [200]
$ curl -s localhost:3000/reports -H "Authorization: Bearer $KEY" -w ' [%{http_code}]\\n'
{"error":"This API key has been revoked."} [401]
`}</Output>
      <div className="prose">
        <p>
          <code>$&#123;KEY%?&#125;x</code> is the key with its last character replaced by <code>x</code>: a key with the
          right id and the wrong secret. Notice that the revoked key is told it was revoked only because its secret was
          right.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Storing the plain key</td><td>A database leak or an old backup hands out working keys</td><td>Store SHA-256 of the key and show the key once</td></tr>
          <tr><td>Keys from <code>Math.random()</code>, <code>random</code> or <code>System.Random</code></td><td>The next key can be predicted from earlier ones</td><td>32 bytes from a CSPRNG</td></tr>
          <tr><td>A key in the query string</td><td>It lands in logs, browser history and <code>Referer</code> headers</td><td><code>Authorization: Bearer</code> or <code>X-API-Key</code>, over TLS</td></tr>
          <tr><td>One all-powerful key per client</td><td>A leak exposes everything the client could ever do</td><td>The fewest scopes the client needs, checked on every endpoint</td></tr>
          <tr><td>Keys that never expire</td><td>Forgotten keys keep working for years</td><td>An expiry, <code>lastUsedAt</code>, and regular clean-up</td></tr>
          <tr><td>Rotation that needs a big-bang switch</td><td>Teams put it off, or it causes an outage</td><td>A new key while the old one stays valid for a grace period</td></tr>
          <tr><td>A secret key inside a browser or mobile app</td><td>Anyone can extract it from the bundle</td><td>Sign users in; keep secret keys on servers</td></tr>
          <tr><td>Saying “revoked” or “expired” before checking the secret</td><td>Strangers learn which key ids exist and their state</td><td>One message for bad keys; details only after the secret matches</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="A pepper, if you want one">
        <p>
          You can store HMAC-SHA256 of the key with a server-side secret (a <strong>pepper</strong>, kept in a key vault)
          instead of plain SHA-256. Then the hashes in a leaked table cannot even be checked against a guessed key without
          the pepper. For 256-bit random keys this adds little, but it protects any short or imported keys you might have.
        </p>
      </Box>

      <Checkpoint question="Chapter 04 says a fast hash like SHA-256 must never store passwords. Why is it the right choice for these API keys?">
        <p>
          Because the secret is 256 random bits from a CSPRNG, not something a person chose. Slow hashing exists to make
          each guess at a likely password expensive; with random keys there are no likely guesses, and the search space is
          too large to cover at any speed. A slow hash would only add 50 to 100 ms to every API call.
        </p>
      </Checkpoint>
      <Checkpoint question="A client runs on 40 servers and its key must be replaced. How do you do it without failed requests?">
        <p>
          Rotate it: <code>POST /keys/&#123;id&#125;/rotate</code> returns a new key and leaves the old one valid for 24
          hours. Deploy the new key to the servers one by one; requests with either key succeed meanwhile. The old key then
          expires on its own. If <code>lastUsedAt</code> shows the old key is no longer used, you can revoke it early. If the
          key leaked, revoke it at once instead and accept a short outage.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does the server answer 403, not 401, when a working key lacks the scope?">
        <p>
          401 means “I do not know who you are”: send credentials, or different ones. 403 means “I know who you are, and
          you may not do this.” A client with a valid key and the wrong scope will not fix the problem by retrying with the
          same key; it needs a key with that scope, which is what the 403 message says.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then add <code>GET /keys</code> for admins:
                each key’s id, name, scopes, expiry, <code>lastUsedAt</code> and whether it is revoked.
              </>
            ),
            hint: <>Build the response field by field from the records. Never return the whole record: it would include the hash, and a test should check that neither the hash nor any key appears in the response.</>,
          },
          {
            task: <>Add test keys: <code>ak_test_…</code> keys that only see sample data, and a live server that refuses them with a clear message.</>,
            hint: <>Store the environment on the record and check the prefix in the format pattern. Refuse a test key on a live server with the same care as an invalid one: verify the secret before saying why.</>,
          },
          {
            task: <>Add a checksum to the end of each key, so a mistyped key is rejected before any database lookup and a secret scanner can tell a real key from random text.</>,
            hint: <>Append a CRC32 of the prefix, id and secret (<code>zlib.crc32</code> in Node.js and Python). In .NET, the first 4 bytes of SHA-256 work as well, without a package. Check it first in <code>verify</code>.</>,
          },
          {
            task: <>Replace the fixed window with a token bucket that allows short bursts but a steady average rate.</>,
            hint: <>Keep <code>tokens</code> and <code>updatedAt</code> per key. On each request add <code>(now − updatedAt) × rate</code> tokens up to the bucket size, then take one if there is one. When empty, <code>Retry-After</code> is the time to earn one token.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>An API key identifies an application. Make it from 32 CSPRNG bytes, with a prefix and an id, and show it once.</li>
          <li>Store only a SHA-256 hash, find the record by id, and compare in constant time; a fast hash is fine for random keys and never for passwords.</li>
          <li>Send keys in <code>Authorization: Bearer</code> or <code>X-API-Key</code>, never in the URL, and only over TLS.</li>
          <li>Give each key the fewest scopes, an expiry, a revoke switch, a rate limit, and rotation with an overlap.</li>
          <li>For people, browsers and mobile apps, use sign-in and tokens instead of API keys.</li>
        </ul>
      </Recap>
    </>
  );
}
