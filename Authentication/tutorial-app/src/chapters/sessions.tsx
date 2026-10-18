import type { ReactNode } from 'react';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { sessionFlow } from '../diagrams/specs/sessions';
import { hrefFor } from '../lib/route';

const T = '05-sessions';
const Ch = ({ id, children }: { id: string; children: ReactNode }) => <a href={hrefFor(id)}>{children}</a>;

export function Sessions() {
  return (
    <>
      <ChapterIntro
        time="2.5–3 hours in one stack"
        project={T}
        learn={[
          'How a server-side session works: a random id in a cookie, everything else on the server',
          'The cookie flags that matter (HttpOnly, Secure, SameSite, Path, Max-Age) and what each one stops',
          'Stopping session fixation with a new id at sign-in, and enforcing idle and absolute timeouts',
          'Signing out so that a copied cookie really stops working',
          'Cross-site request forgery: SameSite plus a token in a header, checked in constant time',
          'Server-side sessions versus signed or encrypted session cookies',
        ]}
        tools={[
          { name: 'Node.js', what: 'express-session with its in-memory store; cookie-parser’s signed cookies for contrast.' },
          { name: 'Python', what: 'A small session store and FastAPI dependencies; Starlette’s SessionMiddleware for contrast.' },
          { name: '.NET', what: 'Cookie authentication with a server-side ticket store, and ASP.NET Core’s antiforgery service.' },
        ]}
      />

      <div className="prose">
        <p>
          HTTP has no memory. Each request arrives on its own, and nothing in the protocol says that this request comes
          from the person who signed in a minute ago. <Ch id="passwords">Chapter 04</Ch> checked a password once; now the
          server has to recognize that user on every later request without asking for the password again.
        </p>
        <p>
          For a website the standard answer is a <strong>session cookie</strong>. The server remembers the sign-in and
          hands the browser a cookie, and the browser sends that cookie back by itself with every request to the site.
          That automatic sending is what makes cookies convenient, and also what makes them attackable. This chapter
          covers both sides.
        </p>
      </div>

      <h2>How a server-side session works</h2>
      <div className="prose">
        <p>
          A <strong>session</strong> is the server’s record of one signed-in visit: who the user is, when they signed in,
          when they were last active, and a CSRF token (explained below). The records live in a <strong>session
          store</strong>: memory in these projects, Redis or a database table in production, so that every server instance
          sees the same sessions and a restart does not sign everyone out.
        </p>
        <p>
          The browser gets only the <strong>session id</strong>, a long random value that names the record. The id means
          nothing on its own, so there is nothing in it to read or edit, and with 256 random bits (OWASP asks for at least
          64 bits of entropy) nobody can guess one. On each request the browser sends <code>Cookie: sid=…</code> and the
          server looks the id up.
        </p>
      </div>

      <Diagram spec={sessionFlow} caption="The browser holds only the id. Signing in creates a session under a new id; every request looks it up; signing out deletes it." />

      <div className="prose">
        <p>
          There is another design: put the session data itself in the cookie, <em>signed</em> so the browser cannot
          change it, or <em>encrypted</em> so it cannot read it either. The server then needs no store at all. Two of
          this chapter’s libraries work that way by default, which is easy to miss:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Server-side session</th><th>Signed cookie</th><th>Encrypted cookie</th></tr>
        </thead>
        <tbody>
          <tr><td>The cookie holds</td><td>A random id</td><td>The data, plus an HMAC signature</td><td>The data, encrypted and signed</td></tr>
          <tr><td>Can the holder read it?</td><td>There is nothing to read</td><td>Yes: it is plain text or base64</td><td>No</td></tr>
          <tr><td>Can the holder change it?</td><td>No: only ids in the store work</td><td>No: the signature breaks</td><td>No</td></tr>
          <tr><td>Sign-out</td><td>Instant: delete the session</td><td>The browser forgets it; a copy works until it expires</td><td>The same as signed</td></tr>
          <tr><td>Size</td><td>Tiny</td><td>Grows with the data (about 4 KB at most)</td><td>Grows with the data</td></tr>
          <tr><td>In these stacks</td><td>express-session; this chapter’s Python store; ASP.NET Core cookie authentication with a ticket store</td><td>Starlette’s <code>SessionMiddleware</code> (itsdangerous); cookie-parser’s signed cookies</td><td>ASP.NET Core cookie authentication, by default</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The main projects use server-side sessions. Step 4 builds the client-side kind too, and its tests show the
          catch: a signed or encrypted cookie keeps working after sign-out.
        </p>
      </div>

      <h2>The cookie, flag by flag</h2>
      <div className="prose">
        <p>
          The server sets a cookie with a <code>Set-Cookie</code> response header. The attributes after the value tell
          the browser how to treat it (RFC 6265, and its revision known as RFC 6265bis, which adds SameSite; it is still an
          IETF draft, though browsers already follow it). A session cookie needs
          these:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Attribute</th><th>What it tells the browser</th><th>What it protects against</th></tr>
        </thead>
        <tbody>
          <tr><td><code>HttpOnly</code></td><td>Scripts on the page cannot read the cookie (<code>document.cookie</code> leaves it out)</td><td>An XSS bug stealing the session id. A script can still send requests while the page is open, so fix the XSS too</td></tr>
          <tr><td><code>Secure</code></td><td>Send it over HTTPS only</td><td>Anyone on the network reading the cookie off plain HTTP, on public Wi-Fi for example</td></tr>
          <tr><td><code>SameSite=Lax</code></td><td>Leave it off requests that other sites start (form posts, <code>fetch</code>, images, iframes); keep it only for top-level GET navigations, such as a link the user clicks</td><td>Most cross-site request forgery, and cross-site leaks</td></tr>
          <tr><td><code>Path=/</code></td><td>Send it to every path on the site</td><td>Nothing by itself: a path is not a security boundary</td></tr>
          <tr><td><code>Max-Age</code> or <code>Expires</code></td><td>Forget it after this long</td><td>A session cookie left behind on a shared computer. Without either, it lasts until the browser closes, and browsers that restore tabs keep it longer still</td></tr>
          <tr><td>No <code>Domain</code></td><td>Send it to this exact host only, not its subdomains</td><td>A sibling such as <code>blog.example.com</code> receiving the cookie</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>SameSite=Strict</code> never sends the cookie with a request another site starts, not even a plain link,
          so a user who follows a link from their email arrives signed out. <code>Lax</code> is the usual choice for a
          session. <code>None</code> sends it everywhere and must be combined with <code>Secure</code>. Some browsers
          default to Lax when the attribute is missing and some do not, so always set it.
        </p>
      </div>
      <Box kind="key" label="Secure, and plain HTTP while developing">
        <p>
          In production every page is HTTPS and the cookie is always <code>Secure</code>. On your own machine, curl and
          most browsers accept and send Secure cookies on <code>http://localhost</code>, so the Python and .NET projects
          keep Secure on even there. express-session is stricter: it does not send a Secure cookie at all unless it knows
          the request arrived over HTTPS. So the Node.js server starts with <code>COOKIE_SECURE=false</code> for plain-HTTP
          development. In production, behind a load balancer or proxy that terminates TLS, tell Express to trust it
          (<code>trust proxy</code>) so that it believes the proxy’s <code>X-Forwarded-Proto: https</code> header. The
          Node.js tests play that proxy.
        </p>
      </Box>
      <Box kind="tip" label="Name it __Host-sid in production">
        <p>
          The browser accepts a cookie whose name starts with <code>__Host-</code> only if it is Secure, has
          <code> Path=/</code> and has no Domain. That stops a subdomain or a plain-HTTP page from planting or overwriting
          it, which also helps against session fixation. These projects use plain <code>sid</code> so the Node.js
          development server can run without Secure.
        </p>
      </Box>

      <h2>Three ways sessions are attacked</h2>
      <TableWrap>
        <thead>
          <tr><th>Attack</th><th>What happens</th><th>The defense in these projects</th></tr>
        </thead>
        <tbody>
          <tr><td>Session hijacking</td><td>An attacker gets a copy of the cookie (through XSS, plain HTTP, a log file or malware) and replays it</td><td>HttpOnly and Secure; idle and absolute timeouts; sign-out that deletes the session on the server</td></tr>
          <tr><td>Session fixation</td><td>The attacker obtains a valid session id (often by signing in to their own account), plants it in the victim’s browser, and waits. If the id survives the victim’s sign-in, the attacker holds a signed-in session</td><td>A brand-new id at every sign-in, and the old session destroyed</td></tr>
          <tr><td>Cross-site request forgery (CSRF)</td><td>A page on another site makes the victim’s browser send a request to yours. The browser attaches the cookie, so the request runs as the victim</td><td>SameSite=Lax, plus a CSRF token on every state-changing request</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          An <strong>idle timeout</strong> ends a session after a stretch with no requests (30 minutes here). An
          <strong> absolute timeout</strong> ends it a fixed time after sign-in, however active it is (8 hours here), so a
          stolen cookie cannot be kept alive forever by replaying it now and then. OWASP suggests 2–5 minutes of idle time
          for high-value applications, 15–30 minutes for low-risk ones, and an absolute limit of 4–8 hours. Enforce both on
          the server: the cookie’s Max-Age only asks the browser to forget, and an attacker’s copy ignores it.
        </p>
      </div>

      <h2>Cross-site request forgery, and the token that stops it</h2>
      <div className="prose">
        <p>
          Say a user is signed in to your notes app and then opens a page on <code>evil.example.net</code>. That page holds
          a hidden form that posts to <code>https://notes.example.com/notes</code> and submits itself. The browser sends
          the request with the user’s cookie, and your server sees a signed-in user adding a note. The attacker never sees
          the response, and does not need to: the request itself is the damage (change an email address, send money,
          delete data).
        </p>
        <p>Two defenses, used together:</p>
        <ul>
          <li>
            <strong>SameSite=Lax</strong> keeps the cookie off cross-site posts, fetches and frames, which stops the
            classic attack in today’s browsers. It is not the whole answer. A “site” is the registrable domain, so a
            compromised sibling such as <code>blog.example.com</code> counts as the same site; an endpoint that changes
            data on GET is still exposed; and old browsers ignore the flag.
          </li>
          <li>
            A <strong>synchronizer token</strong>: a random value stored in the session and handed only to your own pages
            (here by <code>GET /csrf</code>). Every state-changing request must send it back in an
            <code> X-CSRF-Token</code> header, and the server compares it with the session’s copy in constant time. Another
            site can make the browser send the cookie, but it cannot read your pages to learn the token, and it cannot add
            a custom header to a cross-site request without a CORS preflight that your server never approves.
          </li>
        </ul>
        <p>
          The .NET project uses ASP.NET Core’s built-in <strong>antiforgery</strong> service instead of a token stored in
          the session. It issues a pair: a cookie token in a cookie of its own, and a request token for the header. Both
          are encrypted with Data Protection, the request token is tied to the cookie token and to the signed-in user,
          and the two are compared in constant time. From the outside the rules are
          the same: call <code>GET /csrf</code>, then send <code>X-CSRF-Token</code>.
        </p>
        <p>
          One difference: the antiforgery cookie is not part of the session. It survives sign-out, so in the same browser
          a token fetched before sign-out still works after the same user signs in again. The Node.js and Python tokens
          live in the session and die with it. Both are enough against CSRF, because the forging site can read neither.
        </p>
      </div>
      <Box kind="warn" label="XSS defeats every CSRF defense">
        <p>
          A script running on your own origin can read the token from the page and send any request it likes. CSRF
          defenses assume there is no cross-site scripting: encode output, and send a Content-Security-Policy.
        </p>
      </Box>

      <Step n={1}>Random ids, tokens and the user table</Step>
      <div className="prose">
        <p>
          Session ids and CSRF tokens are both 32 bytes from the operating system’s cryptographically secure random
          generator (<code>randomBytes</code> in Node.js, <code>secrets</code> in Python, <code>RandomNumberGenerator</code>
          in .NET), written as 43 base64url characters. Never use <code>Math.random</code>, <code>random.random</code> or
          <code> System.Random</code> for these: their output can be predicted. The user table is chapter 04’s sign-in
          check, with two demo accounts.
        </p>
      </div>
      <StackFiles
        label="Random tokens and the user table"
        node={[`${T}/node/src/tokens.ts`, `${T}/node/src/users.ts`]}
        python={[`${T}/python/tokens.py`, `${T}/python/users.py`]}
        dotnet={`${T}/dotnet/Api/Users.cs`}
      />
      <div className="prose">
        <p>
          Each project also carries chapter 04’s hashing code, trimmed to hash and verify (<code>passwords.ts</code>,
          <code> passwords.py</code>, or ASP.NET Core Identity’s <code>PasswordHasher</code>). In .NET the random session
          key is made by the ticket store in the next step.
        </p>
      </div>

      <Step n={2}>The session store, the cookie and the timeouts</Step>
      <div className="prose">
        <ul>
          <li>
            <strong>Node.js:</strong> express-session does the heavy lifting. It makes the id (with the 256-bit
            <code> genid</code>), keeps the data in its <code>MemoryStore</code>, signs the id in the cookie with
            HMAC-SHA256, and with <code>rolling: true</code> sends the cookie again on every response so that its expiry
            slides. <code>requireSession</code> checks both timeouts against the injected clock and destroys an expired
            session.
          </li>
          <li>
            <strong>Python:</strong> FastAPI has no session store, and you do not need a library for one.
            <code> SessionStore</code> is a dictionary from id to a <code>Session</code> record, and <code>get()</code>
            enforces both timeouts. The FastAPI dependencies that use it are in <code>app.py</code> (Step 3).
          </li>
          <li>
            <strong>.NET:</strong> cookie authentication normally puts the whole sign-in, the <strong>ticket</strong>, in
            the cookie. Setting its <code>SessionStore</code> to an <code>ITicketStore</code> keeps the ticket on the
            server and puts only a random key in the cookie. <code>ExpireTimeSpan</code> with
            <code> SlidingExpiration</code> is the idle timeout. It renews the cookie only once more than half the time has
            passed, so the real idle limit falls between 15 and 30 minutes. There is no absolute limit built in, so
            <code> OnValidatePrincipal</code> checks the sign-in time on every request.
          </li>
        </ul>
      </div>
      <StackFiles
        label="The session store and timeouts"
        node={`${T}/node/src/session.ts`}
        python={`${T}/python/sessions.py`}
        dotnet={[`${T}/dotnet/Api/MemoryTicketStore.cs`, `${T}/dotnet/Api/Sessions.cs`]}
      />
      <Box kind="warn" label="A fixation trap in ASP.NET Core’s ticket store">
        <p>
          The fixation test in Step 5 caught this. When <code>SignInAsync</code> runs on a request that already carries a
          live session cookie, the cookie handler keeps that session’s key: it calls the store’s <code>RenewAsync</code>
          with the old key instead of <code>StoreAsync</code> for a new one. An attacker who planted their own signed-in
          cookie then holds the victim’s session. Remove the <code>StartsNewSession</code> marker and the test shows it:
          the planted cookie’s <code>GET /me</code> answers 200 with the victim’s email.
        </p>
        <p>
          The fix is in <code>MemoryTicketStore</code>. On the sign-in endpoint (the one with the marker),
          <code> RetrieveAsync</code> acts as if the request had no session, so <code>SignInAsync</code> calls
          <code> StoreAsync</code>, which makes a fresh key and deletes the old session. A wrong password never reaches
          <code> StoreAsync</code>, so, as in the other two stacks, it signs nobody out. Calling <code>SignOutAsync</code>
          first is <em>not</em> a fix. The handler remembers the old key for the rest of the request, so the new sign-in
          is renewed under the key that was just removed. That either fails, or, with a store whose
          <code> RenewAsync</code> writes unconditionally, brings the session back under the attacker’s key. Without a
          ticket store none of this applies, because every sign-in writes a completely new cookie.
        </p>
      </Box>

      <Step n={3}>The endpoints: sign in, CSRF token, notes, sign out</Step>
      <div className="prose">
        <ul>
          <li>
            <code>POST /login</code> checks the password, then starts a session under a new id (<code>regenerate</code> in
            express-session, destroy-then-create in Python, a fresh key from the ticket store in .NET), and stores the
            CSRF token and the sign-in time.
          </li>
          <li><code>GET /me</code> and <code>GET /csrf</code> need a live session.</li>
          <li>
            <code>POST /notes</code> and <code>POST /logout</code> need a live session <em>and</em> the CSRF token. With no
            session they answer 401; with a session but no valid token, 403.
          </li>
          <li>
            <code>POST /logout</code> deletes the session from the store, then asks the browser to drop the cookie by
            sending it again, empty and already expired, with the same path and flags.
          </li>
        </ul>
      </div>
      <StackFiles
        label="The endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={`${T}/python/app.py`}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <div className="prose">
        <p>
          Cookie authentication in .NET is built for web pages: when nobody is signed in, it redirects to a login page.
          An API should answer 401 instead, which is what the <code>OnRedirectToLogin</code> event does here. In Python,
          <code> logout</code> builds its own <code>JSONResponse</code>: FastAPI drops the headers a dependency set when an
          endpoint returns a response object, so the cookie refresh from <code>current_session</code> is not sent and
          only the deletion is.
        </p>
      </div>
      <Box kind="tip" label="Protect the sign-in form too (login CSRF)">
        <p>
          A forged request can also sign the victim in to the <em>attacker’s</em> account, so whatever they enter next (a
          card number, a search history) lands where the attacker can see it. These sign-in endpoints accept only JSON,
          which an HTML form on another site cannot send, and a cross-site <code>fetch</code> with a JSON body needs a
          CORS preflight. For an HTML sign-in form, give the page a pre-session with its own CSRF token.
        </p>
      </Box>

      <Step n={4}>For contrast: a session that lives in the cookie</Step>
      <div className="prose">
        <p>Each project also builds the stateless kind, so you can see exactly what changes:</p>
        <ul>
          <li><strong>Node.js:</strong> cookie-parser’s signed cookies. The value is <code>s:</code>, then <code>j:</code> and the JSON (how Express writes an object into a cookie), a dot, and an HMAC-SHA256 signature.</li>
          <li><strong>Python:</strong> Starlette’s <code>SessionMiddleware</code>, which FastAPI apps often reach for first. The value is base64 JSON, a timestamp and an HMAC-SHA1 signature from itsdangerous (its default).</li>
          <li><strong>.NET:</strong> cookie authentication’s default, with no ticket store: the whole ticket, encrypted and signed by ASP.NET Core Data Protection. A test switches the store off.</li>
        </ul>
        <p>
          The tests show two things. Signed is not secret: anyone holding the Node.js or Python cookie can read it, because
          base64 is an encoding, not encryption; only the encrypted .NET cookie hides its contents. None of them can be
          changed without the key. And sign-out cannot take any of them back: the server can only ask the browser to
          delete the cookie, and a copy taken earlier keeps working until it expires.
        </p>
      </div>
      <StackFiles
        label="Client-side sessions, and their tests"
        node={[`${T}/node/src/client-side.ts`, `${T}/node/test/client-side.test.ts`]}
        python={[`${T}/python/client_side.py`, `${T}/python/test_client_side.py`]}
        dotnet={`${T}/dotnet/Api.Tests/ClientSideTests.cs`}
      />
      <div className="prose">
        <p>
          Client-side sessions are fine for small, low-risk data such as a theme or a guest’s basket. For sign-in, prefer a
          server-side session. If you must use a cookie that carries the sign-in, keep its lifetime short and add a check
          the server can revoke, such as a per-user version number stored in the cookie and changed to cancel every cookie
          issued before (ASP.NET Core Identity’s security stamp works this way).
        </p>
      </div>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          The same twelve tests in every stack: the cookie’s flags; a wrong password (which must not end a current
          session either); no session (401, even on <code>POST /notes</code>); fixation; the CSRF token (missing, wrong,
          from another session, and on sign-out); sign-out with a replayed cookie; the idle and absolute timeouts with a
          clock the tests move forward; 256-bit ids; and the two client-side contrasts. The tests send cookies by hand,
          so each request carries exactly the cookie the test means it to.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/app.test.ts`, `${T}/node/test/tokens.test.ts`]}
        python={[`${T}/python/test_app.py`, `${T}/python/test_tokens.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/SessionTests.cs`, `${T}/dotnet/Api.Tests/TokenTests.cs`, `${T}/dotnet/Api.Tests/Helpers.cs`]}
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
          { tag: 'Python', text: '............                                                             [100%]\n12 passed, 1 warning in 0.21s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    12, Skipped:     0, Total:    12, Duration: 700 ms - Api.Tests.dll (net9.0)' },
        ]}
      />

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nCOOKIE_SECURE=false npm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>First look at the cookie each server sets at sign-in:</p>
      </div>
      <StackTerminal
        title="The Set-Cookie header"
        node={`curl -s -i -X POST localhost:3000/login -H "Content-Type: application/json" \\\n  -d '{"email":"ada@example.com","password":"correct horse battery"}' | grep -i set-cookie`}
        python={`curl -s -i -X POST localhost:3000/login -H "Content-Type: application/json" \\\n  -d '{"email":"ada@example.com","password":"correct horse battery"}' | grep -i set-cookie`}
        dotnet={`curl -s -i -X POST localhost:3000/login -H "Content-Type: application/json" \\\n  -d '{"email":"ada@example.com","password":"correct horse battery"}' | grep -i set-cookie`}
      />
      <Output
        caption="The session cookie from each server (the .NET value is shortened)"
        panes={[
          { tag: 'Node.js (COOKIE_SECURE=false)', text: 'Set-Cookie: sid=s%3AOSG6eZwpXtQszEmw4lvCQmJuzvveHPAFO-ikZ5GBm9I.oWEQDZJMSiV74hqfRWqK600CcjthGL4AFuH41CRQdGY; Path=/; Expires=Sun, 18 Oct 2026 04:36:49 GMT; HttpOnly; SameSite=Lax' },
          { tag: 'Python', text: 'set-cookie: sid=CQu9AaoR9hcipWfFkpnD-192_7HPJpimj17UTdSfJ7s; HttpOnly; Max-Age=1800; Path=/; SameSite=lax; Secure' },
          { tag: '.NET', text: 'Set-Cookie: sid=CfDJ8ClV1qVAsg1PveFxvVXjYqZYrF0g0eoUvHEi0Tzy…; expires=Sun, 18 Oct 2026 04:31:38 GMT; path=/; secure; samesite=lax; httponly' },
        ]}
      />
      <div className="prose">
        <p>
          The Node.js value is <code>s:</code>, the 43-character id, a dot and the signature (URL-encoded). The Python
          value is the bare id. The .NET value is the encrypted ticket holding the store’s key. express-session turns
          <code> maxAge</code> into an <code>Expires</code> date, and the Node.js cookie has no <code>Secure</code> only
          because of <code>COOKIE_SECURE=false</code>; the tests check that it is there in production. Now the whole
          session, with a cookie jar file:
        </p>
      </div>
      <Output caption="The same session against each server (all three answer identically)">{`
$ curl -s -c jar.txt -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}'
{"email":"ada@example.com","message":"Signed in."}
$ curl -s -b jar.txt localhost:3000/me
{"email":"ada@example.com"}
$ curl -s -b jar.txt -X POST localhost:3000/notes -H "Content-Type: application/json" -d '{"text":"buy milk"}'
{"error":"Missing or invalid CSRF token."}
$ TOKEN=$(curl -s -b jar.txt -c jar.txt localhost:3000/csrf | jq -r .csrfToken)
$ curl -s -b jar.txt -X POST localhost:3000/notes -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" -d '{"text":"buy milk"}'
{"notes":["buy milk"]}
$ cp jar.txt copy.txt
$ curl -s -b jar.txt -c jar.txt -X POST localhost:3000/logout -H "X-CSRF-Token: $TOKEN"
{"message":"Signed out."}
$ curl -s -b copy.txt localhost:3000/me
{"error":"Sign in first."}
`}</Output>
      <div className="prose">
        <p>
          The last two commands are the point of a server-side session. <code>copy.txt</code> still holds the cookie from
          before sign-out, as an attacker’s stolen copy would, and it gets 401 because the session it names no longer
          exists. (<code>jq</code> extracts the token from the JSON; the <code>-c jar.txt</code> on that call also keeps
          the antiforgery cookie the .NET server sets.)
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>A session id from <code>Math.random</code>, a counter or the user id</td><td>Ids can be guessed, so sessions can be taken over</td><td>A secure random generator and at least 64 bits of entropy (OWASP); 128 or more is common, 256 here</td></tr>
          <tr><td>Keeping the same id across sign-in</td><td>Session fixation</td><td>A new id at sign-in and at any change of privilege; destroy the old session</td></tr>
          <tr><td>Sign-out that only clears the cookie</td><td>A copied cookie keeps working</td><td>Delete the session on the server</td></tr>
          <tr><td>Relying on the cookie’s expiry for timeouts</td><td>An attacker’s copy ignores Max-Age</td><td>Check idle and absolute times on the server</td></tr>
          <tr><td>Changing data on GET</td><td>Lax cookies still go with top-level GETs, and a link or image can trigger one</td><td>POST, PUT, PATCH or DELETE, with a CSRF token</td></tr>
          <tr><td>Comparing tokens with <code>==</code></td><td>The time taken can reveal how much of a guess matched</td><td>A constant-time comparison</td></tr>
          <tr><td>Roles or secrets in a signed cookie</td><td>Anyone can read them, and old copies keep old roles</td><td>Keep them on the server; the cookie holds an id</td></tr>
          <tr><td>CORS with credentials and a reflected <code>Origin</code></td><td>Any site can read your responses, CSRF token included</td><td>An exact allow-list of origins</td></tr>
          <tr><td>A session id in the URL</td><td>It leaks through logs, the Referer header and shared links</td><td>Cookies only</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Two cheap extra checks against CSRF">
        <p>
          Browsers send an <code>Origin</code> header with cross-site posts, and modern browsers also send
          <code> Sec-Fetch-Site</code> (<code>same-origin</code>, <code>same-site</code>, <code>cross-site</code> or
          <code> none</code>). Refusing a state-changing request whose Origin is not yours, or whose Sec-Fetch-Site is
          <code> cross-site</code>, is an inexpensive extra layer. OWASP’s Cross-Site Request Forgery Prevention Cheat
          Sheet describes both.
        </p>
      </Box>

      <Checkpoint question="The cookie is already HttpOnly and SameSite=Lax. Why does the server still want a CSRF token?">
        <p>
          HttpOnly stops scripts from <em>reading</em> the cookie, not the browser from <em>sending</em> it. SameSite=Lax
          stops most cross-site sending, but not an attacker on the same site (a compromised subdomain), not endpoints that
          change data on GET, and not old browsers. The token is something only your own pages can read, so a forged
          request cannot include it.
        </p>
      </Checkpoint>
      <Checkpoint question="A user signs out, but an attacker copied their cookie an hour earlier. What does the copy get with each design in this chapter?">
        <p>
          With the server-side sessions of the main projects, 401: sign-out deleted the session the copy names. With the
          signed or encrypted client-side cookies of Step 4, the copy keeps working until it expires, because the server
          has nothing to delete.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does the .NET ticket store need to know which endpoint is the sign-in?">
        <p>
          Because when <code>SignInAsync</code> runs on a request that already has a live session, ASP.NET Core’s cookie
          handler renews that session under its existing key instead of storing a new one. On the sign-in endpoint the
          store hides the existing session, so the handler asks for a fresh key, and the store deletes the old session
          once the sign-in succeeds. A planted cookie stays worthless, and a wrong password signs nobody out.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: <>In <code>projects/{T}</code>, rebuild the project in your stack, then add <code>POST /logout-all</code>: it signs the user out on every device by deleting all of their sessions.</>,
            hint: <>Keep an index from user to session ids next to the store (a Redis set in production). In Node.js you can also walk the store with <code>store.all()</code>; in .NET, record each key against the user in <code>StoreAsync</code>.</>,
          },
          {
            task: <>Keep sessions in SQLite so that restarting the server does not sign everyone out.</>,
            hint: <>Node.js: extend <code>session.Store</code> and implement <code>get</code>, <code>set</code>, <code>destroy</code> and <code>touch</code>. Python: back <code>SessionStore</code> with <code>sqlite3</code>. .NET: implement <code>ITicketStore</code> over a table, serializing tickets with <code>TicketSerializer.Default</code>.</>,
          },
          {
            task: <>Rename the cookie to <code>__Host-sid</code> and check that it still works in your browser.</>,
            hint: <>The prefix requires Secure, <code>Path=/</code> and no Domain. In Node.js that means HTTPS or a trusted proxy even in development; try a local TLS certificate from <code>mkcert</code>.</>,
          },
          {
            task: <>Reject state-changing requests that carry <code>Sec-Fetch-Site: cross-site</code>, or an <code>Origin</code> that is not your own, and add a test for each.</>,
            hint: <>Requests without these headers (curl, old browsers) should still pass on the CSRF token alone. In a test, set the header by hand and expect 403.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>A server-side session keeps the data on the server and gives the browser only a random 256-bit id, in an HttpOnly, Secure, SameSite=Lax cookie with a Path and a Max-Age.</li>
          <li>Issue a new id at every sign-in, enforce idle and absolute timeouts on the server, and delete the session at sign-out.</li>
          <li>Stop CSRF with SameSite plus a token sent in a header with every state-changing request, compared in constant time.</li>
          <li>Signed cookies (Starlette’s SessionMiddleware, cookie-parser) can be read; encrypted ones (ASP.NET Core) cannot; neither can be revoked at sign-out.</li>
        </ul>
      </Recap>
    </>
  );
}
