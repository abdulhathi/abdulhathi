import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { refreshRotation } from '../diagrams/specs/refresh-tokens';

const T = '09-refresh-tokens';

export function RefreshTokens() {
  return (
    <>
      <ChapterIntro
        time="3–4 hours in one stack"
        project={T}
        learn={[
          'Why access tokens stay short (10 minutes) and a separate, long-lived refresh token keeps the user signed in',
          'Opaque refresh tokens: 256 random bits, stored only as a SHA-256 hash with the user, an expiry and a family ID',
          'Rotating the refresh token on every use, and revoking the whole family when a spent one comes back (RFC 9700)',
          'Signing out, an idle timeout and an absolute lifetime for each sign-in',
          'Where a browser app should keep each token (HttpOnly cookie, memory, or a backend-for-frontend), and where a mobile app should',
          'Why a JWT access token cannot be revoked instantly, and what a deny-list by jti costs',
        ]}
        tools={[
          { name: 'Node.js', what: 'randomBytes and createHash from node:crypto, jose for the access token, cookie-parser and Express 5.' },
          { name: 'Python', what: 'secrets and hashlib from the standard library, PyJWT, and FastAPI’s cookie support.' },
          { name: '.NET', what: 'RandomNumberGenerator and SHA256, JwtBearer for the access token, and Response.Cookies in a minimal API.' },
        ]}
      />

      <div className="prose">
        <p>
          Chapter 08 ended with a dilemma. An access token should expire in minutes, because nobody can recall it once it is
          stolen. But nobody wants to type a password every 10 minutes. The answer is to give the client two tokens with
          different jobs.
        </p>
        <p>
          The <strong>access token</strong> goes to the API on every request and lives 10 minutes. The{' '}
          <strong>refresh token</strong> (RFC 6749, section 1.5) goes only to the sign-in server, only to get a new access
          token, and lives for days. Because the server looks every refresh token up in its database, it can refuse one at
          any moment. That lookup happens once every 10 minutes per user, not on every API call, so you keep most of the
          speed of JWTs and get sign-out back.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Access token</th><th>Refresh token</th></tr>
        </thead>
        <tbody>
          <tr><td>Format here</td><td>A signed JWT (chapter 08)</td><td>An <strong>opaque</strong> random string: it means nothing on its own</td></tr>
          <tr><td>Lifetime</td><td>10 minutes</td><td>7 days unused, 30 days at most after sign-in</td></tr>
          <tr><td>Sent to</td><td>Every API call, as <code>Authorization: Bearer</code></td><td>Only paths under <code>/auth</code>; <code>POST /auth/refresh</code> and <code>/auth/logout</code> read it</td></tr>
          <tr><td>Checked by</td><td>Signature and claims; no database</td><td>A database lookup, every time</td></tr>
          <tr><td>Revoked by</td><td>Waiting for it to expire (or a deny-list)</td><td>Marking its family revoked</td></tr>
          <tr><td>Browser keeps it</td><td>In memory (a JavaScript variable)</td><td>In an HttpOnly, Secure, SameSite cookie</td></tr>
        </tbody>
      </TableWrap>

      <h2>Rotation, families and reuse detection</h2>
      <div className="prose">
        <p>
          A refresh token is a powerful thing to steal: whoever holds it can mint access tokens for days. So each one is
          <strong> single-use</strong>. Every call to <code>/auth/refresh</code> spends the token it receives and returns a
          new one. This is <strong>refresh token rotation</strong>.
        </p>
        <p>
          All the tokens that descend from one sign-in form a <strong>family</strong>, recorded by a family ID. Now suppose
          an attacker copies a refresh token. Sooner or later both the user and the attacker present a copy of the same
          token. The first one gets a new token; the second one presents a token that is already spent. The server cannot
          tell which of the two is the thief, so it does the only safe thing: it <strong>revokes the whole family</strong>,
          and both must sign in again. The user can; the attacker cannot. RFC 9700 (the OAuth 2.0 Security Best Current
          Practice, section 4.14) requires exactly this for <strong>public clients</strong>, apps that cannot keep a
          secret, such as browser and mobile apps. The one alternative it allows is <strong>sender-constrained</strong>{' '}
          refresh tokens, which are bound to a private key the client holds (DPoP, RFC 9449, or mutual TLS, RFC 8705), so
          a copy is useless without that key.
        </p>
        <p>
          Rotation raises the alarm only when both copies get used. If a thief takes the newest token from a device that
          is then never used again, nobody presents a spent token, and the thief keeps refreshing until a time limit
          ends the family. That is why the limits below matter as much as rotation.
        </p>
        <p>Two limits stop a family from living forever:</p>
        <ul>
          <li><strong>Idle timeout:</strong> each refresh token expires 7 days after it was issued, so a device left unused for a week must sign in again.</li>
          <li><strong>Absolute lifetime:</strong> a family ends 30 days after sign-in however active it is, so even a stolen, actively used chain dies.</li>
        </ul>
      </div>

      <Diagram spec={refreshRotation} caption="Each refresh spends the presented token and stores the hash of its replacement in the same family. A spent token coming back revokes the family." />

      <Step n={1}>The refresh token store</Step>
      <div className="prose">
        <p>A few decisions in this small class matter a lot:</p>
        <ul>
          <li>
            <strong>Opaque and random.</strong> 32 bytes from a cryptographic random generator (256 bits), base64url-encoded.
            A JWT would add nothing: the server looks the token up anyway.
          </li>
          <li>
            <strong>Stored as a hash.</strong> The table holds the SHA-256 of each token, never the token, so a leaked
            backup or a SQL injection yields nothing anyone can present. A fast hash is fine here, unlike for passwords
            (chapter 04): with 256 random bits there is nothing to guess.
          </li>
          <li>
            <strong>Spent atomically.</strong> Checking “not used yet” and marking it used must be one step, or two parallel
            requests with the same token could both succeed and fork the family. In SQL that is one{' '}
            <code>UPDATE … WHERE hash = $1 AND used_at IS NULL</code> that changes one row or none. In memory, the Python
            and .NET stores take a lock, because FastAPI and ASP.NET Core run requests on several threads at once. The
            Node store needs none: <code>rotate()</code> never awaits, and Node runs JavaScript on one thread, so no other
            request can run between the check and the update.
          </li>
          <li><strong>Capped by the family.</strong> A new token’s expiry is the earlier of “7 days from now” and the family’s end.</li>
          <li>
            <strong>Spent tokens are kept.</strong> A spent token’s row, marked with when it was used, is what lets the
            server recognize it when it comes back. Keep the rows until their family ends, then delete the family.
          </li>
        </ul>
      </div>
      <StackFiles
        label="The refresh token store"
        node={`${T}/node/src/refresh.ts`}
        python={`${T}/python/refresh.py`}
        dotnet={`${T}/dotnet/Api/RefreshTokenStore.cs`}
      />

      <Step n={2}>Access tokens, and a deny-list for sign-out</Step>
      <div className="prose">
        <p>
          The access token is a JWT validated exactly as in chapter 08. Because this API issues and checks its own tokens,
          it signs them with HS256 and one random 256-bit secret made at start-up; once another service must verify them,
          switch to chapter 08’s RS256 key ring.
        </p>
        <p>
          Here is the catch with JWTs: <strong>an access token cannot be revoked instantly</strong>. The API checks only
          the signature and the claims, so a token keeps working after sign-out until it expires. There are three ways to
          live with that:
        </p>
        <ul>
          <li><strong>Keep it short.</strong> Ten minutes of exposure is the usual answer, and often enough.</li>
          <li>
            <strong>Deny-list it by <code>jti</code>.</strong> On sign-out, store the token’s ID until its <code>exp</code>,
            and refuse it on every request. This brings back a lookup per request, though a tiny one: only tokens that
            were signed out early, each for at most 10 minutes. Use Redis with a TTL so every server sees it.
          </li>
          <li>
            <strong>Ask the issuer.</strong> Opaque access tokens checked with token introspection (RFC 7662) can be revoked
            at once, at the cost of a call to the issuer for every request (usually cached briefly).
          </li>
        </ul>
        <p>These projects keep tokens short and deny-list the access token when the client sends it with sign-out.</p>
      </div>
      <StackFiles
        label="Access tokens and the deny-list"
        node={`${T}/node/src/access.ts`}
        python={`${T}/python/access.py`}
        dotnet={`${T}/dotnet/Api/AccessTokens.cs`}
      />

      <Step n={3}>The endpoints and the cookie</Step>
      <div className="prose">
        <p>
          <code>POST /auth/login</code> starts a family, returns the access token in the JSON body and sets the refresh
          token as a cookie. <code>POST /auth/refresh</code> rotates; on any failure it clears the cookie and answers 401.{' '}
          <code>POST /auth/logout</code> revokes the family, deny-lists the access token if one is sent, clears the cookie
          and answers <code>204 No Content</code>. <code>GET /me</code> needs a valid, not deny-listed access token.
        </p>
        <p>The cookie’s attributes each block one attack:</p>
        <ul>
          <li><code>HttpOnly</code>: page scripts cannot read it, so cross-site scripting (XSS) cannot copy it away.</li>
          <li><code>Secure</code>: it is only sent over HTTPS (most browsers, and curl, make an exception for <code>localhost</code>).</li>
          <li><code>SameSite=Strict</code>: the browser does not send it on requests started by another site, which stops cross-site request forgery.</li>
          <li>
            <code>Path=/auth</code>: the browser sends it only to paths under <code>/auth</code> (sign-in, refresh and
            sign-out), never to the rest of the API. That is why those endpoints live under <code>/auth</code>.
          </li>
          <li><code>Max-Age</code>: the seconds left on the token, so the browser drops it when the server would refuse it.</li>
        </ul>
        <p>
          Token responses also carry <code>Cache-Control: no-store</code>, as RFC 6749 (section 5.1) requires, so no proxy
          or browser cache keeps a copy.
        </p>
      </div>
      <StackFiles
        label="The endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`, `${T}/node/package.json`]}
        python={[`${T}/python/app.py`, `${T}/python/requirements.txt`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <ByStack
        label="Stack notes"
        node={
          <div className="prose">
            <p>
              <code>cookie-parser</code> fills <code>req.cookies</code>. Express’s <code>res.cookie</code> takes{' '}
              <code>maxAge</code> in milliseconds and writes both <code>Max-Age</code> and <code>Expires</code>;{' '}
              <code>res.clearCookie</code> must get the same path, or the browser keeps the old cookie. jose takes the
              fake clock through <code>currentDate</code>, so the Node tests expire an access token by moving the clock
              forward.
            </p>
          </div>
        }
        python={
          <div className="prose">
            <p>
              FastAPI reads the cookie with a <code>Cookie()</code> parameter named after it. <code>set_cookie</code> and{' '}
              <code>delete_cookie</code> are called on the response you return; <code>delete_cookie</code> needs the same
              path. FastAPI runs plain <code>def</code> endpoints on a thread pool, so the refresh store and the
              deny-list each hold a <code>threading.Lock</code>. PyJWT checks <code>exp</code> against the system clock,
              so the test that expires an access token signs in on a clock set 11 minutes in the past.
            </p>
          </div>
        }
        dotnet={
          <div className="prose">
            <p>
              <code>Response.Cookies.Append</code> and <code>Delete</code> take a <code>CookieOptions</code> with the same
              path. On <code>/auth/logout</code>, which does not require authorization, <code>UseAuthentication</code>{' '}
              has already validated any bearer token, so the handler reads <code>jti</code> and <code>exp</code> from the
              user. <code>OnTokenValidated</code> runs the deny-list check and insists on <code>sub</code>,{' '}
              <code>iat</code> and <code>jti</code>, as jose’s <code>requiredClaims</code> and PyJWT’s{' '}
              <code>require</code> do in the other stacks. IdentityModel, like PyJWT, checks <code>exp</code> against the
              system clock, so the test that expires an access token signs in on a clock set 11 minutes in the past.
            </p>
          </div>
        }
      />

      <Step n={4}>Run the tests</Step>
      <div className="prose">
        <p>
          The tests drive a fake clock instead of waiting days. They cover the cookie’s attributes; rotation on every
          refresh; a spent token revoking its family; eight parallel refreshes with one token, of which exactly one may
          win; an expired access token being replaced through refresh; the 7-day idle timeout; the 30-day absolute
          lifetime (refreshing every 6 days, with the cookie’s <code>Max-Age</code> shrinking to one day at the end);
          sign-out; the deny-list; two devices as separate families; and missing or made-up tokens.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/refresh.test.ts`, `${T}/node/test/app.test.ts`]}
        python={[`${T}/python/test_refresh.py`, `${T}/python/test_app.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/RefreshStoreTests.cs`, `${T}/dotnet/Api.Tests/RefreshFlowTests.cs`]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 13\nℹ pass 13\nℹ fail 0' },
          { tag: 'Python', text: '.............                                                            [100%]\n13 passed, 1 warning in 0.22s' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 13, Skipped: 0, Total: 13' },
        ]}
      />

      <h2>Where should each token live?</h2>
      <div className="prose">
        <p>
          A browser gives you several places to put a token, and the choice decides what an attacker gets from one injected
          script:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Place</th><th>Script on the page can read it</th><th>Survives a reload</th><th>Verdict</th></tr>
        </thead>
        <tbody>
          <tr><td><code>localStorage</code></td><td>Yes, and send it anywhere</td><td>Yes, forever</td><td>Avoid for any token (OWASP)</td></tr>
          <tr><td><code>sessionStorage</code></td><td>Yes</td><td>Per tab</td><td>Avoid: the same XSS exposure</td></tr>
          <tr><td>A JavaScript variable (memory)</td><td>Only while the page is open</td><td>No</td><td>Good for the short access token</td></tr>
          <tr><td>HttpOnly, Secure, SameSite cookie</td><td>No</td><td>Yes</td><td>Good for the refresh token, scoped to its path</td></tr>
          <tr><td>Backend-for-frontend (server side)</td><td>No token ever reaches the browser</td><td>Yes</td><td>The strongest option for browser apps</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          This chapter’s design is the middle path: the access token lives in memory and is lost on reload, so the app’s
          first move after a reload is <code>POST /auth/refresh</code>, which the cookie makes possible. Note what HttpOnly
          does and does not buy you: an injected script cannot <em>steal</em> the refresh token for later, but while the
          page is open it can still call <code>/auth/refresh</code> and use the access tokens it gets. Preventing XSS (a
          Content Security Policy, output encoding) still matters.
        </p>
        <p>
          A <strong>backend-for-frontend</strong> (BFF) goes one step further. A small server, on the same site as the
          app, holds both tokens and gives the browser only an ordinary session cookie (chapter 05). The browser calls the
          BFF, and the BFF adds the access token when it forwards the call to the API. No token exists in the browser at
          all. The IETF’s OAuth 2.0 for Browser-Based Applications guidance recommends this pattern for business
          applications and any app that handles sensitive data.
        </p>
      </div>
      <Box kind="tip" label="Native and mobile apps are different">
        <p>
          A native or mobile app has no cookies to lean on and no XSS in the browser sense. It receives the refresh token
          in the JSON response and keeps it in the platform’s secure storage: the iOS Keychain, or on Android encrypted at
          rest with a key held in the Android Keystore. It sends it in the request body, as OAuth’s{' '}
          <code>grant_type=refresh_token</code> (RFC 6749, section 6), and a refused token comes back as{' '}
          <code>400</code> with <code>"error": "invalid_grant"</code> (section 5.2). Rotation and reuse detection apply just the same;
          sender-constrained tokens with DPoP (RFC 9449) make a copied token useless without the device’s private key.
        </p>
      </Box>
      <Box kind="warn" label="Two tabs refreshing at once">
        <p>
          With strict rotation, two tabs that refresh at the same moment send the same token. One wins, the other looks
          like reuse, and the user is signed out. The parallel-refresh test shows exactly this: one request wins, the
          rest count as reuse, and the winner’s new token dies with the family. Have one tab refresh and share the result
          (the Web Locks API or a BroadcastChannel), or allow a grace period of a few seconds in which the old token
          returns the same new pair.
          Some identity providers offer such a reuse interval. Keep it short: it is a window for a thief too.
        </p>
      </Box>

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>
          curl’s <code>-c</code> saves cookies to a file (a “cookie jar”) and <code>-b</code> sends them, like a browser.
          Copying the jar keeps an old refresh token around, which is how the session plays the thief.
        </p>
      </div>
      <Output caption="Sign in, rotate, replay a spent token, sign out (identical against all three servers apart from the Set-Cookie line)">{`
$ curl -s -c jar -D headers.txt -X POST localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}' | jq -c '.access_token |= .[:24] + "..."'
{"access_token":"eyJhbGciOiJIUzI1NiIsInR5...","token_type":"Bearer","expires_in":600}
$ grep -i '^set-cookie' headers.txt
Set-Cookie: refresh_token=rJy1N4fProk8uR8BAOgmNqd07CGtoljPou5atzDztCY; Max-Age=604800; Path=/auth; Expires=Sun, 25 Oct 2026 04:21:05 GMT; HttpOnly; Secure; SameSite=Strict
$ cp jar first-jar
$ curl -s -b jar -c jar -X POST localhost:3000/auth/refresh | jq -c '.access_token |= .[:24] + "..."'
{"access_token":"eyJhbGciOiJIUzI1NiIsInR5...","token_type":"Bearer","expires_in":600}
$ curl -s -b first-jar -X POST localhost:3000/auth/refresh; echo
{"error":"Refresh token reuse detected. Sign in again."}
$ curl -s -b jar -X POST localhost:3000/auth/refresh; echo
{"error":"Invalid refresh token."}
$ curl -s -c jar -o /dev/null -X POST localhost:3000/auth/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}'
$ cp jar before-logout
$ curl -s -b jar -c jar -o /dev/null -w '%{http_code}\\n' -X POST localhost:3000/auth/logout
204
$ curl -s -b jar -X POST localhost:3000/auth/refresh; echo
{"error":"Missing refresh token."}
$ curl -s -b before-logout -X POST localhost:3000/auth/refresh; echo
{"error":"Invalid refresh token."}
`}</Output>
      <div className="prose">
        <p>
          Read the session closely. The replayed first token revoked the family, so even the newest token (in{' '}
          <code>jar</code>) stopped working. After sign-out, curl deleted the cookie from its jar, as a browser would
          (“Missing refresh token”), and the copy made before sign-out is refused by the server (“Invalid refresh token”).
          Each framework writes the same cookie a little differently:
        </p>
      </div>
      <Output
        caption="The Set-Cookie header from each server"
        panes={[
          { tag: 'Node.js (Express)', text: 'Set-Cookie: refresh_token=rJy1N4fProk8uR8BAOgmNqd07CGtoljPou5atzDztCY; Max-Age=604800; Path=/auth; Expires=Sun, 25 Oct 2026 04:21:05 GMT; HttpOnly; Secure; SameSite=Strict' },
          { tag: 'Python (Starlette)', text: 'set-cookie: refresh_token=2d5bJFkkhXgedS0nBh7fSJa7TuyUz8ZyyAdu8vrvhho; HttpOnly; Max-Age=604800; Path=/auth; SameSite=strict; Secure' },
          { tag: '.NET (Kestrel)', text: 'Set-Cookie: refresh_token=pzSTQ98g76Bs0Klq7pbbaNgpJ1jM3bor9hwat6h6BZc; max-age=604800; path=/auth; secure; samesite=strict; httponly' },
        ]}
      />

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Long-lived access tokens instead of refresh tokens</td><td>A stolen token works for days and cannot be recalled</td><td>Minutes for access tokens; refresh tokens for staying signed in</td></tr>
          <tr><td>Refresh tokens that never change</td><td>A copied token works until it expires, silently</td><td>Rotate on every use and revoke the family on reuse</td></tr>
          <tr><td>Storing refresh tokens in plain text</td><td>A leaked table or backup is a list of live sessions</td><td>Store only a SHA-256 hash of each token</td></tr>
          <tr><td>Revoking only the reused token</td><td>The thief may hold the newest token in the chain</td><td>Revoke the whole family</td></tr>
          <tr><td>No absolute lifetime</td><td>An active stolen chain refreshes forever</td><td>End every family a fixed time after sign-in</td></tr>
          <tr><td>Any token in <code>localStorage</code></td><td>One XSS bug sends it to the attacker</td><td>Memory for the access token, an HttpOnly cookie or a BFF for the refresh token</td></tr>
          <tr><td>The refresh cookie on <code>Path=/</code></td><td>It rides along on every request and in every log of them</td><td>Scope it to the refresh and sign-out paths</td></tr>
          <tr><td>Sign-out that only deletes the cookie in the browser</td><td>A copied refresh token keeps working</td><td>Revoke the family on the server</td></tr>
          <tr><td>Check-then-update without a transaction</td><td>Two parallel refreshes both succeed and fork the family</td><td>Spend the token in one atomic update</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="What a breach response looks like">
        <p>
          Reuse detection is an alarm, not just a 401. Log it with the user and family ID, and consider emailing the user
          and revoking all their families. If you can, record the device or IP address with each family so a user can see
          and end their sessions from a “signed-in devices” page.
        </p>
      </Box>

      <Checkpoint question="An attacker copies Ada’s refresh token from a backup of her laptop and uses it before Ada does. What happens, step by step?">
        <p>
          The attacker’s refresh succeeds: they get a new access token and a new refresh token, and Ada’s copy is now spent.
          When Ada’s app next refreshes, it presents the spent token. The server sees it was already used, revokes the
          whole family (including the attacker’s new token), and answers 401. Ada signs in again and gets a new family;
          the attacker is locked out, holding only an access token that expires within 10 minutes.
        </p>
      </Checkpoint>
      <Checkpoint question="Why can the refresh token be stored with a fast SHA-256, when passwords need a slow hash?">
        <p>
          Slow hashing protects secrets that people choose, which are guessable: an attacker with the hash tries likely
          passwords. A refresh token is 256 random bits; there is no likely value to try, and checking all 2<sup>256</sup>{' '}
          is impossible however fast the hash. The hash only has to make the stored value useless to present, and SHA-256
          does that.
        </p>
      </Checkpoint>
      <Checkpoint question="A user clicks “Sign out” and the server revokes the family. Can their access token still call the API?">
        <p>
          Yes, until it expires (at most 10 minutes here), unless the API also checks a deny-list. The API verifies only the
          signature and claims of a JWT, so it never learns about the sign-out. This project deny-lists the token’s{' '}
          <code>jti</code> when the client sends it with the sign-out request; the test “an access token outlives logout
          unless its jti is deny-listed” shows both cases.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then move the store into a database
                (SQLite is enough) with two tables, <code>refresh_families</code> and <code>refresh_tokens</code>, and spend
                tokens with a single conditional <code>UPDATE</code>.
              </>
            ),
            hint: <>Make <code>hash</code> the primary key. Spend with <code>UPDATE refresh_tokens SET used_at = ? WHERE hash = ? AND used_at IS NULL</code> and check the affected row count: 0 means unknown or already used, so then look the row up to tell which.</>,
          },
          {
            task: <>Add <code>GET /auth/sessions</code> listing the user’s live families (created, last used, user agent) and <code>DELETE /auth/sessions/:id</code> to end one, as a “signed-in devices” page would.</>,
            hint: <>Record the user agent and time on each family at sign-in, and update a <code>lastUsedAt</code> on each rotation. Only list and delete families whose <code>userId</code> matches the access token’s <code>sub</code>.</>,
          },
          {
            task: <>Add a 5-second grace period: a token presented again within 5 seconds of being spent returns the same replacement instead of revoking the family. Write the test first.</>,
            hint: <>Store the replacement’s hash and the plain replacement token briefly (in memory only, never in the database), keyed by the spent token’s hash, and expire the entry after 5 seconds.</>,
          },
          {
            task: <>Build a tiny backend-for-frontend: a server that signs the user in, keeps both tokens in its own server-side session, and proxies <code>GET /api/me</code> to this project’s <code>/me</code> with the access token, refreshing it when it gets a 401.</>,
            hint: <>The browser only ever holds the BFF’s session cookie (chapter 05). Refresh once on a 401 and retry the call once; if the refresh fails, clear the session and answer 401 to the browser.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>Access tokens stay short (minutes); an opaque refresh token, used only at the sign-in server, keeps the user signed in.</li>
          <li>Store only a SHA-256 hash of each refresh token, with the user, its expiry and a family ID.</li>
          <li>Rotate on every refresh, spend tokens atomically, and revoke the whole family when a spent token comes back (RFC 9700).</li>
          <li>Give every family an idle timeout and an absolute lifetime; sign-out revokes the family on the server.</li>
          <li>In a browser: access token in memory, refresh token in an HttpOnly, Secure, SameSite cookie scoped to /auth, or a BFF holding both.</li>
          <li>A JWT cannot be recalled: keep it short, or deny-list its jti until it expires.</li>
        </ul>
      </Recap>
    </>
  );
}
