import { Code } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { magicLinkFlow } from '../diagrams/specs/magic-links';

const T = '16-magic-links';

export function MagicLinks() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours in one stack"
        project={T}
        learn={[
          'How passwordless sign-in by email works, and what its security really rests on',
          'Single-use 256-bit link tokens, stored only as SHA-256 hashes with a 15-minute expiry, and used up atomically',
          'A 6-digit email code for signing in on another device, with limits on wrong guesses',
          'Answering every request the same way, and rate-limiting per email address and per IP address',
          'Keeping link scanners and email prefetchers from using up the link',
          'Testing it all with a fake mailer',
        ]}
        tools={[
          { name: 'Node.js', what: 'randomBytes, randomInt, createHash and createHmac from node:crypto; Express 5 and cookie-parser.' },
          { name: 'Python', what: 'secrets, hashlib and hmac from the standard library; FastAPI with a form endpoint.' },
          { name: '.NET', what: 'RandomNumberGenerator, SHA256 and HMACSHA256; a minimal API with cookies and a form post.' },
        ]}
      />

      <div className="prose">
        <p>
          A <strong>magic link</strong> signs a user in without a password. They type their email address, the server
          emails them a link with a long random token in it, and opening the link signs them in. Many apps also put a
          short <strong>one-time code</strong> in the same email, to type in when the email is open on a different device.
        </p>
        <p>
          There is no password to choose, reuse, leak or reset, so this removes a whole class of problems. What remains is
          one question: can this person read this inbox right now? Everything in this chapter is about making that check
          precise: the token works once, for 15 minutes, only for its own email, and nobody can learn whether an address
          has an account by asking.
        </p>
      </div>
      <Box kind="key" label="The inbox is the factor">
        <p>
          A magic link is exactly as strong as the email account behind it. That is less of a loss than it sounds: most
          password sites already let anyone with the inbox reset the password. But know its limits. NIST SP 800-63B
          (section 3.1.3.1) says email must not be used as an out-of-band authenticator, because a mailbox may be
          protected by only a password, and mail can be read at the servers it passes through or rerouted. So a magic
          link suits sign-in where email is already the way back into the account; it does not meet a NIST assurance
          level. For high-value accounts, add a second factor (chapter 14) or offer passkeys (chapter 15).
        </p>
      </Box>

      <h2>A link, a code, or both</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>Magic link</th><th>Email code</th></tr>
        </thead>
        <tbody>
          <tr><td>What the user does</td><td>Clicks once</td><td>Types 6 digits</td></tr>
          <tr><td>Works on another device</td><td>Awkward: it opens wherever the email is read</td><td>Yes: read on the phone, type on the laptop</td></tr>
          <tr><td>Guessing</td><td>Impossible: 256 random bits</td><td>One in a million per try, so tries must be limited</td></tr>
          <tr><td>Stored as</td><td>SHA-256 hash</td><td>HMAC with a server key</td></tr>
          <tr><td>Phishing</td><td>A fake site can ask the user to paste the link</td><td>Easier: “read me the code” works over the phone</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The projects send both in one email. Using either one uses up both, and asking again replaces them. The routes,
          the same in all three stacks:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Route</th><th>Does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>POST /auth/email</code></td><td>Sends a link and code if the account exists; always answers <code>202</code> with the same message</td></tr>
          <tr><td><code>GET /auth/verify?token=…</code></td><td>From the browser that asked: signs in. From anywhere else: a confirmation page</td></tr>
          <tr><td><code>POST /auth/verify</code></td><td>The confirmation page’s form: signs in</td></tr>
          <tr><td><code>POST /auth/code</code></td><td>Email and code: signs in</td></tr>
          <tr><td><code>GET /me</code></td><td>Who the session cookie belongs to</td></tr>
        </tbody>
      </TableWrap>

      <Diagram spec={magicLinkFlow} caption="The server keeps only hashes. Opening the link in the browser that asked signs in at once; anywhere else, a confirmation page waits for a deliberate click." />

      <Step n={1}>Tokens and codes that work once</Step>
      <div className="prose">
        <p>The store of pending sign-ins does five things, and each has a reason:</p>
        <ul>
          <li>
            <strong>256 random bits from the operating system’s secure generator</strong> (<code>randomBytes</code>,
            <code> secrets</code>, <code>RandomNumberGenerator</code>). Never <code>Math.random</code>, a timestamp or a
            UUID: the first two can be predicted, many UUID versions contain a timestamp, and the UUID standard says not
            to assume UUIDs are hard to guess.
          </li>
          <li>
            <strong>Only the SHA-256 hash is stored.</strong> If the table leaks, the attacker gets hashes, and cannot
            turn them back into working links. A fast hash is enough here, unlike for passwords: nobody can try all
            2<sup>256</sup> tokens, so slowing each try down adds nothing.
          </li>
          <li>
            <strong>The code is stored as an HMAC</strong>, a hash keyed with a secret that is not in the database. A
            plain hash of a 6-digit code would fall in a second to someone trying all million codes; without the key they
            cannot even start.
          </li>
          <li>
            <strong>15 minutes, and one use.</strong> Using it up is a single step: the record is removed before anything
            else is checked, so two requests with the same token cannot both succeed. In a database this is one
            statement, shown below.
          </li>
          <li>
            <strong>Five wrong codes use the code up</strong>, and the user asks for a new email instead.
            <strong> Twenty wrong codes in a row</strong> for one address, across all its emails, switch codes off for
            that address until it signs in with a link. Step 2 explains why both are needed.
          </li>
        </ul>
      </div>
      <StackFiles
        label="Pending sign-ins"
        node={`${T}/node/src/magic-links.ts`}
        python={`${T}/python/magic_links.py`}
        dotnet={`${T}/dotnet/Api/MagicLinks.cs`}
      />
      <Code title="The same store in PostgreSQL (configuration, not run by the tests)" lang="sql">{`
CREATE TABLE magic_links (
  token_hash   text PRIMARY KEY,           -- SHA-256 of the token, hex
  email        text NOT NULL UNIQUE,       -- one pending sign-in per address
  code_hmac    bytea NOT NULL,
  browser_hash text NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL
);

-- Using a link: find it, delete it and read it in one statement. A second request deletes nothing.
DELETE FROM magic_links
WHERE token_hash = $1 AND expires_at > now()
RETURNING email;
`}</Code>

      <Step n={2}>Rate limits per email address and per IP address</Step>
      <div className="prose">
        <p>
          Without limits, <code>POST /auth/email</code> is a free way to flood someone’s inbox, and an unlimited supply of
          fresh codes to guess. Two sliding-window limits fix that: at most 3 emails per address and 10 per IP address in
          any 15 minutes, answered with <code>429</code> and a <code>Retry-After</code> header.
        </p>
        <p>
          Together with the 5 tries per code, the per-address limit allows 15 guesses in any 15 minutes: about a 1 in
          67,000 chance. That is not enough on its own, because the attacker can keep going: 1,440 guesses a day add up to
          about a 4% chance in a month. So the store also counts wrong codes in a row for each address, across all its
          emails. After 20, it refuses every code for that address until the user signs in with a link, and a successful
          sign-in resets the count. NIST SP 800-63B (section 3.2.2) allows at most 100 failures in a row for any
          authenticator; lower is allowed. An attacker now gets 20 guesses, a 1 in 50,000 chance, between two of the
          user’s own sign-ins. Switching codes off costs the user little, because the link still works.
        </p>
        <p>
          The per-IP limit slows one client trying many addresses. (With IPv6, count by the /64 prefix: one user often
          has a whole /64.) Both limits count unknown addresses too, so a 429 says nothing about which accounts exist.
        </p>
      </div>
      <StackFiles
        label="A sliding-window rate limiter"
        node={`${T}/node/src/rate-limit.ts`}
        python={`${T}/python/rate_limit.py`}
        dotnet={`${T}/dotnet/Api/RateLimiter.cs`}
      />
      <Box kind="tip" label="Built-in limiters">
        <p>
          ASP.NET Core ships rate-limiting middleware (<code>AddRateLimiter</code> with
          <code> RateLimitPartition.GetSlidingWindowLimiter</code>) that suits the per-IP limit. The per-address limit
          needs the email from the request body, so all three projects use the same small class for both, which also lets
          the tests drive it with a fake clock. With several servers, keep the counts in Redis.
        </p>
      </Box>

      <Step n={3}>A fake mailer</Step>
      <div className="prose">
        <p>
          Tests must not send real email, and a dev server should not need a mail account. The <strong>outbox</strong>
          keeps every email in a list: the tests read the link and code from it, and the dev server prints each one. A
          real app puts the email on a queue for a provider (SES, SendGrid, Postmark, an SMTP relay), which also means the
          response never waits for the mail server, so a known and an unknown address take about the same time.
        </p>
      </div>
      <StackFiles
        label="The outbox"
        node={`${T}/node/src/outbox.ts`}
        python={`${T}/python/outbox.py`}
        dotnet={`${T}/dotnet/Api/Outbox.cs`}
      />

      <Step n={4}>The endpoints, and link scanners</Step>
      <div className="prose">
        <p>
          <code>POST /auth/email</code> gives the same <code>202</code> and the same message whether or not the account
          exists, and sets the same cookie. The link starts with the configured base URL, never the request’s
          <code> Host</code> header: an attacker could send a request with <code>Host: evil.example</code> for your email,
          and you would receive a real sign-in link pointing at their site. One click
          would hand them your token.
        </p>
        <p>
          The harder part is <code>GET /auth/verify</code>. Many mail systems open every link in a message before the user
          does: corporate link scanners check it for malware, and mail and chat apps fetch it to draw a preview. If a GET
          signed the user in and used up the token, the scanner would spend it, and the user’s own click would fail. The
          projects use two defenses together:
        </p>
        <ul>
          <li>
            <strong>Bind the link to the browser that asked.</strong> <code>POST /auth/email</code> sets a random
            <code> signin_browser</code> cookie (HttpOnly, SameSite=Lax, only for <code>/auth</code>, for 15 minutes) and
            stores its hash with the token. A GET that carries that cookie is the user’s own browser: it signs in at once.
            The cookie is Lax rather than Strict because the click often starts in webmail on another site, and browsers
            do not send Strict cookies on a navigation that starts on another site.
          </li>
          <li>
            <strong>Anything else gets a confirmation page.</strong> A scanner, a preview fetcher, or the user on another
            device sees a page with a “Continue signing in” button. Its form posts the token to
            <code> POST /auth/verify</code>, which signs in. Scanners fetch pages and rarely submit forms; never submit
            this one with a script, because some scanners run scripts. The page is sent with
            <code> Referrer-Policy: no-referrer</code> and <code>Cache-Control: no-store</code>, so the token in its
            address does not leak to other sites or caches, and with
            <code> Content-Security-Policy: frame-ancestors 'none'</code>, so no other site can show it in a hidden
            frame and trick the user into pressing the button.
          </li>
        </ul>
        <p>
          Signing in sets an HttpOnly <code>session</code> cookie. Chapter 05 covers sessions and cookie flags properly; in
          production add <code>Secure</code>, since the site is served over HTTPS.
        </p>
        <p>
          The token travels in the query string, so anything that logs full URLs logs working sign-in links. The Node.js
          server logs no requests. Uvicorn’s access log prints the path and query string, so the start command below turns
          it off with <code>--no-access-log</code>. ASP.NET Core logs every request’s URL at the Information level, so
          <code> Program.cs</code> keeps <code>Microsoft.AspNetCore</code> logs to warnings. In production, check the
          proxy and load balancer logs too.
        </p>
        <p>
          Each route reads one kind of body: <code>POST /auth/email</code> and <code>POST /auth/code</code> take JSON,
          and <code>POST /auth/verify</code> takes the confirmation page’s form. A JSON body with a field missing gets the
          route’s usual 400 or 401 in every stack. A body of the other kind, or JSON that does not parse, never signs
          anyone in, but the answer differs. On the JSON routes, FastAPI answers 422 with details and ASP.NET Core 415
          (an empty 400 for broken JSON), while Express ignores the body and gives the route’s usual 400 or 401 (an HTML
          400 page for broken JSON). A JSON body on <code>POST /auth/verify</code> gets 400 in Node.js and Python and 415
          in .NET.
        </p>
      </div>
      <StackFiles
        label="The endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`, `${T}/node/package.json`]}
        python={[`${T}/python/app.py`, `${T}/python/requirements.txt`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="warn" label="Login CSRF on the confirmation form">
        <p>
          <strong>Login CSRF</strong> is a hostile page making the victim’s browser sign in to the attacker’s account,
          where the victim might then type something private. <code>POST /auth/code</code> is safe from it because it
          accepts only an <code>application/json</code> body: an HTML form cannot send one, and a script on another
          site may send one only after a CORS preflight that this server never approves. The tests check that a form
          post is refused; do not add a form parser to that route. <code>POST /auth/verify</code> has to accept a form, and has no CSRF token, because the browser
          posting it is not signed in yet. So a hostile page could post the attacker’s own token from the victim’s browser.
          Exercise 2 closes it by checking the <code>Origin</code> header; the <code>frame-ancestors</code> policy above
          matters here too, because a click inside a frame of your own page would send your own origin.
        </p>
      </Box>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          Each project tests the same cases through HTTP, with a fresh app per test, a fake clock and the outbox. A link
          works once, even when ten requests use it at the same moment. An expired link or code fails, and so does a
          replaced link. An unknown address gets the same answer and no email. Only the hash of the token is stored. The
          link starts with the configured base URL even when the request sends <code>Host: evil.example</code>. A link
          opened without the asking browser’s cookie, or with another browser’s, shows the confirmation page. The code
          works once, five wrong codes use it up, and a code posted by an HTML form is refused. Both rate limits are
          checked. Two tests check the store directly (the code is an HMAC under the server key, and 20 wrong codes in a
          row switch codes off until a link is used), and two more check the limiter on its own.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/app.test.ts`, `${T}/node/test/magic-links.test.ts`, `${T}/node/test/rate-limit.test.ts`]}
        python={[`${T}/python/test_app.py`, `${T}/python/test_magic_links.py`, `${T}/python/test_rate_limit.py`]}
        dotnet={[
          `${T}/dotnet/Api.Tests/MagicLinkTests.cs`,
          `${T}/dotnet/Api.Tests/MagicLinksTests.cs`,
          `${T}/dotnet/Api.Tests/RateLimiterTests.cs`,
        ]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 17\nℹ pass 17\nℹ fail 0' },
          { tag: 'Python', text: '.................                                                        [100%]\n17 passed, 1 warning' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    17, Skipped:     0, Total:    17' },
        ]}
      />
      <div className="prose">
        <p>
          The tests use the HTTP client the way a browser would. Python’s <code>TestClient</code> and .NET’s test client
          keep cookies, so a second client stands in for “another browser”; Node.js’s <code>fetch</code> keeps none, so
          its tests pass the cookie explicitly. <code>fetch</code> also always sends the real <code>Host</code> header,
          so the Node.js test for a forged one uses <code>node:http</code>. Python’s one warning is a deprecation notice
          from Starlette’s test client, not from this code. The refused form post gets each framework’s own status
          (401, 422, 415), so the tests check only that it does not sign in.
        </p>
      </div>

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000 --no-access-log`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>
          The account <code>ada@example.com</code> exists. <code>-c jar</code> and <code>-b jar</code> make curl save and
          send cookies like a browser; leaving them out plays a link scanner or another device. Each email appears in the
          server’s terminal:
        </p>
      </div>
      <Output caption="In the server’s terminal (the first of three emails)">{`
--- Email to ada@example.com: Your sign-in link
Sign in to Auth Lab:
http://localhost:3000/auth/verify?token=jGb-ot1cmDd0eaYoo0d3FbaAH0SlemfBhSgFJb5BDaE

Or enter this code: 403631

The link and the code work once and expire in 15 minutes. If you did not ask for this, ignore this email.
---
`}</Output>
      <Output caption="The same session against each server (all three answer identically; tokens differ every run)">{`
$ curl -s -c jar -X POST localhost:3000/auth/email -H "Content-Type: application/json" -d '{"email":"ada@example.com"}'
{"message":"Check your email. If an account exists, a sign-in link and code are on the way."}
$ curl -s -X POST localhost:3000/auth/email -H "Content-Type: application/json" -d '{"email":"nobody@example.com"}'
{"message":"Check your email. If an account exists, a sign-in link and code are on the way."}
$ TOKEN=jGb-ot1cmDd0eaYoo0d3FbaAH0SlemfBhSgFJb5BDaE   # from the email the server printed
$ curl -s -b jar -c jar "localhost:3000/auth/verify?token=$TOKEN"
{"email":"ada@example.com","message":"Signed in."}
$ curl -s -b jar localhost:3000/me
{"email":"ada@example.com"}
$ curl -s -b jar -c jar "localhost:3000/auth/verify?token=$TOKEN"
{"error":"This link is not valid or has expired. Ask for a new one."}
# A new link, opened without the cookie: what a link scanner, or another device, sees
$ curl -s -X POST localhost:3000/auth/email -H "Content-Type: application/json" -d '{"email":"ada@example.com"}'
{"message":"Check your email. If an account exists, a sign-in link and code are on the way."}
$ TOKEN=7ONA92nvjFXk2QoPeNXy2bXsdHM-t72f78tm5id4OtI
$ curl -s "localhost:3000/auth/verify?token=$TOKEN"
<!doctype html>
<meta charset="utf-8">
<title>Sign in</title>
<form method="post" action="/auth/verify">
  <input type="hidden" name="token" value="7ONA92nvjFXk2QoPeNXy2bXsdHM-t72f78tm5id4OtI">
  <button type="submit">Continue signing in</button>
</form>
$ curl -s -X POST localhost:3000/auth/verify -d "token=$TOKEN"
{"email":"ada@example.com","message":"Signed in."}
# The code from a new email instead of the link
$ curl -s -X POST localhost:3000/auth/email -H "Content-Type: application/json" -d '{"email":"ada@example.com"}'
{"message":"Check your email. If an account exists, a sign-in link and code are on the way."}
$ curl -s -X POST localhost:3000/auth/code -H "Content-Type: application/json" -d '{"email":"ada@example.com","code":"000000"}'
{"error":"That code is not valid or has expired."}
$ curl -s -X POST localhost:3000/auth/code -H "Content-Type: application/json" -d '{"email":"ada@example.com","code":"751081"}'
{"email":"ada@example.com","message":"Signed in."}
# A fourth email for the same address within 15 minutes
$ curl -s -i -X POST localhost:3000/auth/email -H "Content-Type: application/json" -d '{"email":"ada@example.com"}' | grep -iE "^(HTTP|retry-after|\\{)"
HTTP/1.1 429 Too Many Requests
Retry-After: 900
{"error":"Too many requests. Try again later."}
`}</Output>
      <div className="prose">
        <p>
          Python’s server writes the header in lower case (<code>retry-after</code>), which HTTP treats as the same
          header, and the seconds can read 899 if the session took more than a second.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>“No account with that email”</td><td>Anyone can list which addresses have accounts</td><td>One answer, one status, one cookie for every address; send mail from a queue so the timing matches</td></tr>
          <tr><td>Building the link from the <code>Host</code> header</td><td>An attacker gets a real link pointing at their site sent to the victim</td><td>A configured base URL</td></tr>
          <tr><td>Storing the raw token</td><td>A leaked table is a list of working sign-in links</td><td>Store SHA-256 of the token</td></tr>
          <tr><td>Reusable or long-lived links</td><td>A forwarded email or an old log line still signs in</td><td>One use, 15 minutes, and a new request replaces the old link</td></tr>
          <tr><td>Signing in on any GET</td><td>Scanners use up the link, and the user’s click fails</td><td>Bind to the asking browser; otherwise confirm with a POST</td></tr>
          <tr><td>Unlimited code tries or emails</td><td>Six digits fall to guessing; inboxes get flooded</td><td>5 tries per code, a cap on wrong codes in a row per address, and per-address and per-IP limits</td></tr>
          <tr><td>Accepting form posts on the code route</td><td>Another site’s form can sign the visitor into the attacker’s account</td><td>Accept only JSON there; check <code>Origin</code> on the one form route</td></tr>
          <tr><td>Predictable tokens</td><td><code>Math.random</code>, timestamps and some UUIDs can be guessed</td><td>32 bytes from the secure random generator</td></tr>
          <tr><td>Logging full request URLs</td><td>Tokens in query strings end up in access logs (uvicorn’s and ASP.NET Core’s, by default)</td><td>Turn off or redact <code>token=</code> in logs; short expiry and single use limit the damage</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="Why is a plain SHA-256 good enough for the link token, but not for a password or the 6-digit code?">
        <p>
          Hashing protects a stored secret by making it impractical to try every possible value. A token has 2<sup>256</sup>
          possible values, so even a fast hash leaves nothing to try. A password is chosen by a person and falls to a
          dictionary unless the hash is slow and salted. A 6-digit code has only a million values, so anyone holding the
          table can try them all against an unkeyed hash: in a second if it is fast, and still within reach with enough
          hardware if it is slow. Stored as an HMAC with a key that is not in the database, it leaves them nothing to try.
        </p>
      </Checkpoint>
      <Checkpoint question="A company’s mail gateway opens every link in incoming email. What happens with these projects, and what would happen if GET /auth/verify signed in directly?">
        <p>
          The gateway has no <code>signin_browser</code> cookie, so it gets the confirmation page, and the token is not
          used. When the user clicks, their browser has the cookie and signs in at once (or, on another device, they press
          the button). If the GET signed in directly, the gateway’s visit would use up the token, and the user would see
          “This link is not valid or has expired.”
        </p>
      </Checkpoint>
      <Checkpoint question="Why does POST /auth/email count requests for addresses that have no account?">
        <p>
          So that the limits behave identically for every address. If only real accounts were counted, a fourth request
          answered with 429 would reveal that the address has an account, undoing the identical answers.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then let unknown addresses sign up: email
                them a link that creates the account when it is used.
              </>
            ),
            hint: <>Issue the same kind of token for an unknown address, and mark the record “new account”. Keep the response identical, and create the user only in <code>consume</code>, so typing someone else’s address creates nothing.</>,
          },
          {
            task: <>Close the login CSRF gap: reject <code>POST /auth/verify</code> with 403 when the <code>Origin</code> header names another site.</>,
            hint: <>Compare <code>Origin</code> with the configured base URL. Browsers send it on cross-site form posts. You can also require <code>Sec-Fetch-Site: same-origin</code> when that header is present.</>,
          },
          {
            task: <>Support <code>?next=/settings</code> so the user lands where they started, without creating an open redirect.</>,
            hint: <>Store <code>next</code> with the pending sign-in when the email is requested, not in the link. Accept only paths that start with a single <code>/</code>, never <code>//</code> or a full URL.</>,
          },
          {
            task: <>Move the pending sign-ins to a database table and use them with the single <code>DELETE … RETURNING</code> statement above.</>,
            hint: <>SQLite (3.35 and later) and PostgreSQL both support <code>RETURNING</code>. For a code, count the try before checking it: <code>UPDATE magic_links SET attempts = attempts + 1 WHERE email = $1 AND attempts &lt; 5 AND expires_at &gt; now() RETURNING code_hmac</code>. Only five requests ever get a row back, however many arrive at once. If the HMAC matches, spend it with <code>DELETE … WHERE email = $1 AND code_hmac = $2 RETURNING email</code>, which only one request can win.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>A magic link proves access to an inbox: one factor, as strong as the email account.</li>
          <li>Make 256-bit tokens with the secure random generator, store only their SHA-256, expire them in 15 minutes and use each once, atomically.</li>
          <li>Store email codes as an HMAC, allow 5 tries per code and a capped number of wrong codes in a row, and limit emails per address and per IP address.</li>
          <li>Answer every address the same way, and build links from a configured base URL.</li>
          <li>Never sign in on a scanner’s GET: bind the link to the asking browser, and confirm with a POST anywhere else, on a page that cannot be framed.</li>
        </ul>
      </Recap>
    </>
  );
}
