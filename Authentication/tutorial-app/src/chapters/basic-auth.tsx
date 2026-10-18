import type { ReactNode } from 'react';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { basicFlow } from '../diagrams/specs/basic-auth';
import { hrefFor } from '../lib/route';

const T = '06-basic-auth';
const Ch = ({ id, children }: { id: string; children: ReactNode }) => <a href={hrefFor(id)}>{children}</a>;

export function BasicAuth() {
  return (
    <>
      <ChapterIntro
        time="1.5–2 hours in one stack"
        project={T}
        learn={[
          'What the Authorization: Basic header carries, and why base64 is not encryption',
          'The 401 challenge: WWW-Authenticate with a realm and charset="UTF-8"',
          'Parsing the header correctly: the first colon, UTF-8, and a case-insensitive scheme name',
          'Checking the password against a stored hash on every request, in constant time',
          'Where Basic is still the right choice, and where it is not',
        ]}
        tools={[
          { name: 'Node.js', what: 'A small hand-written Express middleware; scrypt from node:crypto.' },
          { name: 'Python', what: 'FastAPI’s HTTPBasic security class, taught to read UTF-8; argon2-cffi.' },
          { name: '.NET', what: 'A custom AuthenticationHandler registered as an authentication scheme, with RequireAuthorization.' },
        ]}
      />

      <div className="prose">
        <p>
          HTTP Basic authentication is the oldest and simplest scheme on the web: the client sends the username and
          password with <em>every</em> request. There is no session, no token and no cookie. It is defined in RFC 7617, on
          top of the general HTTP authentication framework in RFC 9110, and every HTTP client supports it: browsers,
          <code> curl -u</code>, Python’s requests, .NET’s HttpClient, CI systems and package managers.
        </p>
        <p>
          That simplicity makes it the right tool in a few places and a poor one in most others. This chapter builds it
          properly, then says where it belongs.
        </p>
      </div>

      <h2>How it works</h2>
      <div className="prose">
        <p>Two headers do all the work:</p>
        <ul>
          <li>
            The <strong>challenge</strong>. A request without valid credentials gets <code>401 Unauthorized</code> with
            <code> WWW-Authenticate: Basic realm="Auth Lab", charset="UTF-8"</code>. RFC 9110 requires a 401 to carry this
            header: it tells the client which scheme to use. A browser answers it by showing its own sign-in dialog.
          </li>
          <li>
            The <strong>credentials</strong>. The client sends <code>Authorization: Basic </code> followed by the base64
            encoding of <code>username:password</code>. For <code>ada</code> and <code>correct horse battery</code> that is
            <code> Basic YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ==</code>.
          </li>
        </ul>
        <p>
          The <strong>realm</strong> names the protected area. Browsers show it in the dialog and remember the credentials
          per realm. The <strong>charset</strong> parameter, whose only allowed value is <code>UTF-8</code>, tells the
          client to encode a non-ASCII name or password as UTF-8 (normalized to Unicode Normalization Form C first).
          <strong> Base64</strong> is only an encoding that makes any bytes safe to put in a header. Anyone can reverse it;
          it hides nothing.
        </p>
      </div>

      <Diagram spec={basicFlow} caption="The server answers a bare request with a challenge; the client repeats it with the encoded username and password, and the server verifies them on every request." />

      <Box kind="warn" label="TLS, or not at all">
        <p>
          Over plain HTTP, Basic hands the password to everyone on the network path, on every request, not just once at
          sign-in. Serve it over HTTPS only (with HSTS, so browsers never try plain HTTP), redact the
          <code> Authorization</code> header from logs, proxies and tracing tools, and never put credentials in a URL such
          as <code>https://ada:secret@example.com</code>, where they end up in histories and logs.
        </p>
      </Box>

      <h2>When Basic is the right choice</h2>
      <TableWrap>
        <thead>
          <tr><th>Situation</th><th>Basic?</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>A CI job or script calling an internal API over TLS</td><td>Yes</td><td>Every tool supports it, and there is no token exchange to build</td></tr>
          <tr><td>A machine-to-machine call behind TLS, with a long random secret as the password</td><td>Yes, or an API key</td><td>Simple. Rotate the secret like a key (<Ch id="api-keys">chapter 07</Ch>)</td></tr>
          <tr><td>Git over HTTPS, package registries, webhook receivers</td><td>Common</td><td>Usually with a personal access token in the password field</td></tr>
          <tr><td>A quick admin page or metrics endpoint inside your network</td><td>Acceptable</td><td>Better than nothing; for people, company SSO with MFA is better (<Ch id="oidc">chapter 12</Ch>)</td></tr>
          <tr><td>Signing in to a public website</td><td>No</td><td>The browser’s dialog cannot be styled, offers no password reset and no second factor, and cannot sign out</td></tr>
          <tr><td>A single-page app that keeps the password to send it each time</td><td>No</td><td>The password sits in JavaScript memory or storage; use a session (<Ch id="sessions">chapter 05</Ch>)</td></tr>
          <tr><td>Anything over plain HTTP</td><td>Never</td><td>The password is readable on the wire</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <strong>Why browsers cannot sign out.</strong> Once a user has typed credentials into the dialog, the browser
          caches them for that realm and sends them with every request until the browser closes, sometimes longer. There
          is no dependable way to make it forget them. The W3C <code>Clear-Site-Data: "cookies"</code> response header is
          meant to clear saved HTTP credentials too, but it is still a working draft and browsers do not apply it
          consistently. The older tricks (answering a request with a 401, or sending deliberately wrong credentials from a
          script) also behave differently from browser to browser. On the server there is nothing to end either, because
          there is no session. The only way to revoke access is to change the password.
        </p>
      </div>

      <Step n={1}>Parse the header, and answer with a challenge</Step>
      <div className="prose">
        <p>The parsing rules are short, and each one has a test:</p>
        <ul>
          <li>The scheme name is case-insensitive: <code>basic</code> works as well as <code>Basic</code>.</li>
          <li>
            Take the value after the scheme and the spaces, and accept only standard base64 with its <code>=</code>
            padding. Decode it, then decode the bytes strictly as UTF-8. Anything else is malformed.
          </li>
          <li>
            Split at the <em>first</em> colon. RFC 7617 does not allow a colon in the username, but a password may contain
            any number of them.
          </li>
          <li>
            Normalize both parts to Unicode Normalization Form C (NFC). Then <code>ë</code> sent as one code point
            (U+00EB) and sent as <code>e</code> plus a combining diaeresis (U+0308) match the same stored account.
          </li>
          <li>
            No <code>Authorization</code> header, or a different scheme such as <code>Bearer</code>, means “no
            credentials”: 401 with <code>Authentication required.</code> A malformed Basic header or a wrong password
            gets 401 with <code>Username or password is incorrect.</code> Both carry the challenge.
          </li>
        </ul>
      </div>
      <StackFiles
        label="Parsing Basic credentials and sending the challenge"
        node={`${T}/node/src/basic.ts`}
        python={`${T}/python/basic.py`}
        dotnet={`${T}/dotnet/Api/BasicAuthenticationHandler.cs`}
      />
      <div className="prose">
        <ul>
          <li>
            <strong>Node.js:</strong> <code>parseBasic</code> returns the credentials, <code>'missing'</code> or
            <code> 'malformed'</code>, and <code>basicAuth</code> wraps it as middleware. <code>Buffer.from(…, 'base64')</code>
            quietly skips characters that are not base64 and accepts missing padding, so a regular expression checks the
            input first, and a
            <code> TextDecoder</code> with <code>fatal: true</code> refuses bytes that are not UTF-8.
          </li>
          <li>
            <strong>Python:</strong> FastAPI’s <code>HTTPBasic</code> declares the scheme in the OpenAPI document (so
            <code> /docs</code> gets an Authorize button) and normally parses the header too. Its built-in decoder accepts
            ASCII only, so a password such as <code>grüße aus Köln</code> would be refused; the subclass replaces
            <code> __call__</code> with a UTF-8 version and adds <code>charset="UTF-8"</code> to the challenge.
          </li>
          <li>
            <strong>.NET:</strong> ASP.NET Core has no built-in Basic handler, so this one derives from
            <code> AuthenticationHandler&lt;AuthenticationSchemeOptions&gt;</code>. It splits the header by hand, like the
            other two, because <code>AuthenticationHeaderValue.TryParse</code> is more lenient (it accepts a tab after the
            scheme), and checks the base64 with the same regular expression as Node.js, because
            <code> Convert.FromBase64String</code> skips spaces inside the value. <code>HandleAuthenticateAsync</code>
            returns <code>NoResult</code> (no Basic credentials), <code>Fail</code> (malformed or wrong) or
            <code> Success</code> with the user’s claims. <code>HandleChallengeAsync</code> runs when an endpoint needs a
            user and there is none, and writes the 401, the challenge and the JSON body.
          </li>
        </ul>
      </div>

      <Step n={2}>Check the password on every request</Step>
      <div className="prose">
        <p>
          Users are stored with a password hash, exactly as in <Ch id="passwords">chapter 04</Ch>, never the password
          itself. Checking on every request has two consequences:
        </p>
        <ul>
          <li>
            <strong>Timing.</strong> An unknown username is checked against a dummy hash, so it takes as long as a known
            one, and the hash comparison inside each verify call is constant-time. The answer is the same for both, so the
            API does not reveal which usernames exist.
          </li>
          <li>
            <strong>Cost.</strong> A slow hash runs on every call. At OWASP’s settings, a request to <code>/me</code> on a
            laptop takes about 200 ms and 128 MiB of memory with scrypt (Node.js), about 70 ms with PBKDF2 (.NET) and
            about 20 ms with Argon2id (Python). Wrong guesses cost as much as right ones, so a flood of bad requests can
            exhaust CPU and memory. For a person using an internal tool, behind a rate limit, the cost is fine. For a busy
            machine client, give it a long random secret instead of a chosen password: with 256 random bits there is
            nothing to brute-force, so a fast SHA-256 lookup is safe, which is how API keys work in{' '}
            <Ch id="api-keys">chapter 07</Ch>.
          </li>
        </ul>
      </div>
      <StackFiles
        label="The users and the protected route"
        node={[`${T}/node/src/users.ts`, `${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={[`${T}/python/users.py`, `${T}/python/app.py`]}
        dotnet={[`${T}/dotnet/Api/Users.cs`, `${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <div className="prose">
        <p>
          In .NET, <code>AddAuthentication(…).AddScheme&lt;AuthenticationSchemeOptions, BasicAuthenticationHandler&gt;</code>
          registers the handler as the default scheme, and <code>RequireAuthorization()</code> on <code>/me</code> is the
          minimal-API form of <code>[Authorize]</code>: no authenticated user, no entry. <code>/health</code> has neither,
          so it stays public. In Node.js the middleware goes on the routes that need it, and in Python the
          <code> current_user</code> dependency does the same job.
        </p>
      </div>
      <Box kind="warn" label="Rate-limit Basic like a sign-in form">
        <p>
          Every request is a password guess, on every protected route. Apply chapter 04’s lockout or a rate limit per
          username and per IP address, or an attacker can try passwords at full speed. Caching a successful check for a
          minute (keyed by an HMAC of the header) saves CPU, but it also delays the effect of a password change.
        </p>
      </Box>

      <Step n={3}>Run the tests</Step>
      <div className="prose">
        <p>
          The same nine tests in every stack: the challenge, the right credentials (and no cookie set), a wrong password
          and an unknown user answered alike, a password with colons, UTF-8 names and passwords, both Unicode spellings of
          a letter, malformed headers (not base64, no colon, not UTF-8, missing padding, a space inside) and another
          scheme, a lower-case scheme name, and a public route. The tests use a cheap hashing cost.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={`${T}/node/test/app.test.ts`}
        python={`${T}/python/test_app.py`}
        dotnet={`${T}/dotnet/Api.Tests/BasicAuthTests.cs`}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 9\nℹ pass 9\nℹ fail 0' },
          { tag: 'Python', text: '.........                                                                [100%]\n9 passed, 1 warning in 0.18s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:     9, Skipped:     0, Total:     9, Duration: 601 ms - Api.Tests.dll (net9.0)' },
        ]}
      />

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>A request with no credentials gets the challenge. The headers around it differ by server; the challenge does not:</p>
      </div>
      <StackTerminal
        title="The challenge"
        node={`curl -s -i localhost:3000/me`}
        python={`curl -s -i localhost:3000/me`}
        dotnet={`curl -s -i localhost:3000/me`}
      />
      <Output
        caption="The 401 from each server"
        panes={[
          { tag: 'Node.js', text: 'HTTP/1.1 401 Unauthorized\nX-Powered-By: Express\nWWW-Authenticate: Basic realm="Auth Lab", charset="UTF-8"\nContent-Type: application/json; charset=utf-8\nContent-Length: 36\nETag: W/"24-2ya6UNOy8AlxJkjNOyYmjYabP90"\nDate: Sun, 18 Oct 2026 04:01:57 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\n\n{"error":"Authentication required."}' },
          { tag: 'Python', text: 'HTTP/1.1 401 Unauthorized\ndate: Sun, 18 Oct 2026 04:02:07 GMT\nserver: uvicorn\nwww-authenticate: Basic realm="Auth Lab", charset="UTF-8"\ncontent-length: 36\ncontent-type: application/json\n\n{"error":"Authentication required."}' },
          { tag: '.NET', text: 'HTTP/1.1 401 Unauthorized\nContent-Type: application/json; charset=utf-8\nDate: Sun, 18 Oct 2026 04:02:19 GMT\nServer: Kestrel\nTransfer-Encoding: chunked\nWWW-Authenticate: Basic realm="Auth Lab", charset="UTF-8"\n\n{"error":"Authentication required."}' },
        ]}
      />
      <Output caption="The same session against each server (all three answer identically)">{`
$ curl -s -u 'ada:correct horse battery' localhost:3000/me
{"username":"ada"}
$ curl -s -u 'ada:wrong password' localhost:3000/me
{"error":"Username or password is incorrect."}
$ curl -s -u 'ci-bot:s3cret:with:colons' localhost:3000/me
{"username":"ci-bot"}
$ curl -s localhost:3000/health
{"status":"ok"}
$ curl -s -v -u 'ada:correct horse battery' localhost:3000/me 2>&1 | grep Authorization
> Authorization: Basic YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ==
$ echo YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ== | base64 -d
ada:correct horse battery
`}</Output>
      <div className="prose">
        <p>
          <code>-u</code> builds the <code>Authorization</code> header for you, and curl splits its argument at the first
          colon, just like the servers. The last two commands are what an eavesdropper on plain HTTP would do: read the
          header, decode it, and have the password.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Basic over plain HTTP</td><td>The password is readable on every request</td><td>HTTPS only, with HSTS</td></tr>
          <tr><td>Comparing against plain-text passwords</td><td>A leak exposes every password</td><td>Store a slow hash and verify it (chapter 04)</td></tr>
          <tr><td>Comparing with <code>==</code></td><td>The time taken reveals how much matched</td><td>The hashing library’s verify, or a constant-time comparison</td></tr>
          <tr><td><code>split(':')</code> on the decoded value</td><td>Passwords containing colons are cut short</td><td>Split at the first colon only</td></tr>
          <tr><td>Decoding as ASCII or Latin-1</td><td>Non-ASCII names and passwords fail or mismatch</td><td>UTF-8, advertised with <code>charset="UTF-8"</code></td></tr>
          <tr><td>A 401 without <code>WWW-Authenticate</code></td><td>Clients cannot tell which scheme to use, and RFC 9110 requires it</td><td>Always send the challenge with a 401</td></tr>
          <tr><td>Logging the <code>Authorization</code> header</td><td>Passwords end up in log files and log services</td><td>Redact it in logs, proxies and traces</td></tr>
          <tr><td>No limit on failed attempts</td><td>Every route becomes a password-guessing endpoint</td><td>Lock out or rate-limit per username and IP</td></tr>
          <tr><td>Basic for signing in to a public website</td><td>No sign-out, no MFA, a dialog that is easy to imitate</td><td>A session (chapter 05), passkeys (chapter 15) or OpenID Connect (chapter 12)</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="A colleague says Basic is safe over plain HTTP because the password is base64-encoded. What do you show them?">
        <p>
          The last two lines of the curl session: <code>echo YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ== | base64 -d</code> prints
          <code> ada:correct horse battery</code>. Base64 is an encoding with no key. Anyone who sees the request has the
          password, on every request, so Basic needs TLS.
        </p>
      </Checkpoint>
      <Checkpoint question="Why can’t a website sign out a user who signed in with Basic?">
        <p>
          The browser caches the credentials for the realm and resends them automatically, and there is no dependable way
          to make it forget them (<code>Clear-Site-Data</code> is meant to, but browsers differ). The server keeps no
          session it could delete. Access ends only when the browser is closed or the
          password changes.
        </p>
      </Checkpoint>
      <Checkpoint question="Why split the decoded value at the first colon rather than the last?">
        <p>
          RFC 7617 forbids a colon in the username but allows any number in the password. Splitting at the first colon
          always gives the whole username and the whole password; splitting at the last would move part of a password
          like <code>s3cret:with:colons</code> into the username.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: <>In <code>projects/{T}</code>, rebuild the project in your stack, then add <code>GET /reports</code> that only <code>ci-bot</code> may call.</>,
            hint: <>A known user who is not allowed gets <code>403 Forbidden</code> with no challenge: the credentials were fine, the permission is missing. In .NET use a policy with <code>RequireUserName("ci-bot")</code>.</>,
          },
          {
            task: <>Add chapter 04’s lockout: five failures in a row for a username return <code>429</code> with <code>Retry-After</code> until 15 minutes pass.</>,
            hint: <>Check the limiter before verifying the password. Count failures for unknown usernames too, so the lockout itself does not reveal which accounts exist.</>,
          },
          {
            task: <>Accept either Basic credentials or a bearer API key on the same route.</>,
            hint: <>Node.js: try one parser, then the other. Python: <code>HTTPBasic</code> and <code>HTTPBearer</code>, both with <code>auto_error=False</code>. .NET: register both schemes and list them in the policy, or add a policy scheme with <code>ForwardDefaultSelector</code>.</>,
          },
          {
            task: <>Cache successful checks for 60 seconds and measure the speed-up with a real hashing cost.</>,
            hint: <>Key the cache by an HMAC-SHA256 of the whole header with a server-side secret, never the raw header. Clear a user’s entries when their password changes.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>Basic sends <code>base64(username:password)</code> in the <code>Authorization</code> header on every request; base64 is not encryption, so it needs TLS.</li>
          <li>Answer a missing or wrong credential with <code>401</code> and <code>WWW-Authenticate: Basic realm="…", charset="UTF-8"</code>.</li>
          <li>Parse carefully: case-insensitive scheme, strict UTF-8, split at the first colon; then verify against a stored hash, in constant time, with the same answer for unknown users.</li>
          <li>Use it for scripts, CI and machine-to-machine calls over TLS; not for people signing in to a website, which cannot even sign out.</li>
        </ul>
      </Recap>
    </>
  );
}
