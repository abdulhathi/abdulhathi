import { Code } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { authorizationChecks } from '../diagrams/specs/authorization';

const T = '18-authorization';

export function Authorization() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours in one stack"
        project={T}
        learn={[
          'The difference between authentication (who you are) and authorization (what you may do)',
          'When to answer 401, 403 or 404, and why another tenant’s document should look missing',
          'Role checks (RBAC), scope checks for tokens, and attribute rules (ABAC) such as “editors publish only in their own department”',
          'Checking ownership on every read and write, the defense against broken object level authorization (OWASP API1:2023)',
          'Keeping tenants apart in every query, and never taking the tenant or owner from the request body',
        ]}
        tools={[
          { name: 'Node.js', what: 'Express 5 middleware, a small policy module, and jose for the test tokens.' },
          { name: 'Python', what: 'FastAPI dependencies, a small policy module, and PyJWT for the test tokens.' },
          { name: '.NET', what: 'ASP.NET Core authorization policies, requirements and handlers, IAuthorizationService for resource-based checks, and JwtBearer.' },
        ]}
      />

      <div className="prose">
        <p>
          Every chapter so far answered one question: <em>who is calling?</em> That is <strong>authentication</strong>. A
          password, a session cookie, a JWT, a passkey or a client certificate all end the same way, with a known user.
          This chapter answers the next question: <em>what may this user do?</em> That is <strong>authorization</strong>,
          and it is where most real API breaches happen. Attackers rarely break the sign-in. They sign in as themselves
          and then ask for someone else’s data.
        </p>
        <p>
          The project is a small documents API for a business app used by several customer companies at once. Each
          customer is a <strong>tenant</strong>: a separate organization whose data must never be visible to the others.
          Inside a tenant, users have roles and departments, and each document has an owner. Sign-in itself is not part of
          this project: the tests, and the server at start-up, sign a short JWT for each demo user (chapter 08 explains JWTs
          in full), so every request arrives with a verified user and we can concentrate on the rules.
        </p>
      </div>

      <h2>Four ways to decide</h2>
      <div className="prose">
        <p>
          Real systems mix several models. Each answers a different question, and this project uses all four, because a
          real API needs all four.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Model</th><th>The question it answers</th><th>In this project</th><th>Good at, and weak at</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Roles</strong> (RBAC, role-based access control)</td><td>What is this person’s job?</td><td>Only editors and admins create documents; only admins delete</td><td>Simple and auditable. Breaks down when you need roles like “north-sales-editor”</td></tr>
          <tr><td><strong>Scopes</strong></td><td>What did the user let this token do?</td><td>A reporting tool gets a token with only <code>documents:read</code></td><td>Limits third-party and machine clients (OAuth 2.0, RFC 6749). Says nothing about which objects</td></tr>
          <tr><td><strong>Attributes and policies</strong> (ABAC)</td><td>Do the user’s and the object’s properties fit a rule?</td><td>Editors publish only documents of their own department</td><td>Expressive without inventing roles. Rules must live in one place, or nobody can review them</td></tr>
          <tr><td><strong>Ownership</strong> (object level)</td><td>Is this particular object yours, or in your tenant?</td><td>Only the owner (or an admin) edits; another tenant’s documents do not exist for you</td><td>The check that stops BOLA. Must run on every read and every write</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The effective permission is the <em>intersection</em>: Ada is an editor (role), but a tool holding her
          read-only token (scope) still cannot write; and even with full scopes she can only edit her own documents
          (ownership) in her own tenant.
        </p>
      </div>

      <h2>401, 403 or 404?</h2>
      <div className="prose">
        <p>
          Status codes tell clients what went wrong, and they can also leak what exists. RFC 9110 (HTTP Semantics)
          defines them, and this API uses them consistently:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Status</th><th>Meaning</th><th>When this API sends it</th></tr>
        </thead>
        <tbody>
          <tr><td><code>401 Unauthorized</code></td><td>We do not know who you are (the name is a historical accident: it means unauthenticated)</td><td>No token, with a bare <code>WWW-Authenticate: Bearer</code>; or a forged, expired or malformed token, or one without a claim the rules need, with <code>Bearer error="invalid_token"</code> (RFC 6750)</td></tr>
          <tr><td><code>403 Forbidden</code></td><td>We know who you are, and you may not do this</td><td>A missing scope (with <code>error="insufficient_scope"</code>, RFC 6750), a missing role, or a document you can see but may not change</td></tr>
          <tr><td><code>404 Not Found</code></td><td>There is nothing here for you</td><td>The id does not exist, belongs to another tenant, or is a draft you may not even read. All three get the same body</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="The rule this API follows">
        <p>
          <strong>If you may not know a document exists, it is 404. If you can see it but may not do this to it, it is
          403.</strong> Answering 403 for another tenant’s document would confirm that the id is real, which lets an
          attacker map another customer’s data. RFC 9110 (section 15.5.4) explicitly allows a server to answer 404 to
          hide a forbidden resource. GitHub does the same for private repositories. Inside your own tenant, 403 is the
          honest and more useful answer: the user can see the document, so tell them why the edit failed.
        </p>
        <p>
          The scope and role checks keep to the same rule without any lookup. They do not look at the document, so they
          run first and give the same 403 for every id, real or not: an editor who tries to delete <code>d1</code>,
          another tenant’s <code>d4</code> or an id that does not exist gets the same answer, which says nothing about
          what exists.
        </p>
      </Box>

      <Diagram spec={authorizationChecks} caption="Every request passes the same checks in the same order. Each check can stop it with its own status code." />

      <h2>The bug behind most API breaches</h2>
      <div className="prose">
        <p>
          <strong>Broken object level authorization</strong> (BOLA, also called insecure direct object reference or IDOR)
          is first in the OWASP API Security Top 10 (API1:2023). The handler checks that the caller is signed in, then loads
          whatever id the URL names. Changing <code>/documents/d1</code> to <code>/documents/d2</code> is all an attacker
          needs. Random ids make guessing harder but are not a fix: ids leak through logs, links, emails and other API
          responses.
        </p>
      </div>
      <Code title="An example of the bug (not one of the project files)">{`
// Signed in? Yes. Allowed to see THIS document? Never asked.
app.get('/documents/:id', authenticate(key), (req, res) => {
  const doc = db.documents.findById(req.params.id); // any tenant, any owner
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.json(doc);
});
`}</Code>
      <div className="prose">
        <p>
          The fix has two parts, and this project does both: the data layer only ever searches the caller’s tenant, and a
          policy decides whether this user may perform this action on this document, on every route that touches one.
        </p>
      </div>

      <Step n={1}>The caller and the data</Step>
      <div className="prose">
        <p>
          The token carries everything the rules need: <code>sub</code> (the user id), <code>tenant</code>,
          <code> roles</code> (a JSON array), <code>department</code>, and <code>scope</code> (a space-separated list, as in
          OAuth 2.0). It is an HS256 JWT signed with a random key made at start-up. Verification pins the algorithm,
          issuer and audience, requires an expiry, and allows no clock skew (ASP.NET Core allows five minutes unless you
          set <code>ClockSkew</code>, so the .NET project sets it to zero). A token that verifies but lacks one of those
          claims (or whose <code>roles</code> is not a list) is rejected too: a rule that reads a missing tenant must
          never fall back to “no tenant, so everything”.
        </p>
        <p>
          The document store is where tenant isolation starts. It has no “find by id” method at all: every lookup takes
          the caller’s tenant, so another tenant’s document is indistinguishable from one that does not exist. In a
          database this is a <code>WHERE tenant = $1</code> on every query, and the tenant always comes from the verified
          token, never from the URL, a header or the request body.
        </p>
      </div>
      <StackFiles
        label="Tokens, the demo users and the tenant-scoped store"
        node={[`${T}/node/src/tokens.ts`, `${T}/node/src/documents.ts`]}
        python={[`${T}/python/tokens.py`, `${T}/python/documents.py`]}
        dotnet={[`${T}/dotnet/Api/Tokens.cs`, `${T}/dotnet/Api/Documents.cs`]}
      />
      <div className="prose">
        <p>The demo data is the same in every stack:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>User</th><th>Tenant</th><th>Role</th><th>Department</th></tr>
        </thead>
        <tbody>
          <tr><td>ada</td><td>north</td><td>editor</td><td>sales</td></tr>
          <tr><td>bo</td><td>north</td><td>viewer</td><td>sales</td></tr>
          <tr><td>cy</td><td>north</td><td>editor</td><td>support</td></tr>
          <tr><td>di</td><td>north</td><td>admin</td><td>it</td></tr>
          <tr><td>eve</td><td>south</td><td>admin</td><td>sales</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Document</th><th>Tenant</th><th>Owner</th><th>Department</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr><td>d1 Sales plan</td><td>north</td><td>ada</td><td>sales</td><td>draft</td></tr>
          <tr><td>d2 Price list</td><td>north</td><td>ada</td><td>sales</td><td>published</td></tr>
          <tr><td>d3 Support rota</td><td>north</td><td>cy</td><td>support</td><td>draft</td></tr>
          <tr><td>d4 South roadmap</td><td>south</td><td>eve</td><td>sales</td><td>draft</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Where roles and scopes come from in real tokens">
        <p>
          With Microsoft Entra ID, app roles arrive in the <code>roles</code> claim and delegated scopes in
          <code> scp</code> (space-separated); Okta and Keycloak use <code>scp</code> or <code>scope</code> and their own
          group or role claims. Tenant and department usually come from your own user table, looked up by the token’s
          <code> sub</code> (or <code>oid</code> and <code>tid</code> in Entra ID), because an identity provider rarely
          knows your business attributes.
        </p>
      </Box>

      <Step n={2}>One policy, in one place</Step>
      <div className="prose">
        <p>
          Every rule about documents lives in one small function that takes a user, an action and a document and returns
          yes or no. Nothing in it touches HTTP, so it is easy to read in review and easy to test exhaustively. The first
          line is the tenant check, with no exceptions: an admin of the south tenant is a stranger in the north tenant.
        </p>
        <ul>
          <li><strong>read</strong>: published documents are visible to everyone in the tenant; drafts to their owner, editors and admins.</li>
          <li><strong>update</strong>: the owner, or an admin (ownership).</li>
          <li><strong>publish</strong>: an admin, or an editor whose department matches the document’s (an attribute rule).</li>
          <li><strong>delete</strong>: admins only (a role rule).</li>
        </ul>
        <p>
          In .NET the same rules are an <code>AuthorizationHandler&lt;OperationAuthorizationRequirement, Document&gt;</code>:
          <strong> resource-based authorization</strong>, where the handler receives the document itself. Endpoints call
          <code> IAuthorizationService.AuthorizeAsync(user, document, DocumentOperations.Publish)</code>. The same file
          holds the <code>ScopeRequirement</code> and its handler, and a small <code>DocumentAccess</code> service that
          turns the two checks into 404 or 403.
        </p>
      </div>
      <StackFiles
        label="The document policy"
        node={`${T}/node/src/policy.ts`}
        python={`${T}/python/policy.py`}
        dotnet={`${T}/dotnet/Api/Authorization.cs`}
      />

      <Step n={3}>Enforce it on every route</Step>
      <div className="prose">
        <p>The routes apply the checks in the order of the diagram:</p>
        <ul>
          <li>
            <strong>Deny by default.</strong> Authentication is mounted on the whole app (Express <code>app.use</code>,
            FastAPI’s app-level <code>dependencies</code>, ASP.NET Core’s fallback policy), so a route added next month is
            protected even if its author forgets. In Express it comes before the JSON body parser, so a stranger’s body
            is never parsed. FastAPI’s built-in <code>/docs</code> and <code>/openapi.json</code> pages do not run the
            app’s dependencies, so the Python project turns them off.
          </li>
          <li>
            <strong>Scope, then role.</strong> Each route names the scope it needs; create and delete also name a role.
            These checks do not need the document, so they run first and cheaply, and their 403 is the same for every
            id.
          </li>
          <li>
            <strong>Load through the policy.</strong> One helper (<code>loadDocument</code>, <code>document_for</code>,
            <code> DocumentAccess.LoadAsync</code>) loads the id from the caller’s tenant, answers 404 if the caller may
            not read it, and 403 if they may read it but not do this. Every route with an id uses it, including the read
            route, so no handler ever sees a document the caller should not.
          </li>
          <li>
            <strong>The server sets the sensitive fields.</strong> Creating a document takes only a title. Tenant, owner,
            department and status come from the token and the server; extra fields in the body are ignored. Letting a
            client set them is broken object property level authorization (OWASP API3:2023, which merged the 2019
            list’s “mass assignment” and “excessive data exposure”). The title is checked only after the access checks,
            so a <code>400</code> never confirms that an id exists either: a missing or blank title is
            <code> 400 {'{"error":"Enter a title."}'}</code> in every stack. A body that is not valid JSON is
            rejected by the framework itself, in its own format: Express with a <code>400</code> HTML page, ASP.NET Core
            with an empty <code>400</code>, FastAPI with a <code>422</code> and its <code>detail</code> list. A title that
            is not a string is the same JSON <code>400</code> in Node.js, but a framework error in the other two. FastAPI
            parses the body before it runs any dependency, so it sends its <code>422</code> even without a token. None
            of these answers depends on the document, so none reveals which ids exist.
          </li>
        </ul>
        <p>
          ASP.NET Core’s policies fail with an empty 401 or 403 by default. The project registers an
          <code> IAuthorizationMiddlewareResultHandler</code> so .NET returns the same JSON bodies and headers as the
          other two stacks: <code>WWW-Authenticate: Bearer error="invalid_token"</code> when a token was sent and
          refused, and <code>Bearer error="insufficient_scope"</code> when the failed requirement was a scope.
        </p>
      </div>
      <StackFiles
        label="The routes"
        node={[`${T}/node/src/middleware.ts`, `${T}/node/src/app.ts`, `${T}/node/src/server.ts`, `${T}/node/package.json`]}
        python={[`${T}/python/deps.py`, `${T}/python/app.py`, `${T}/python/requirements.txt`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="warn" label="Filter lists in the query, not just single objects">
        <p>
          <code>GET /documents</code> is a read of many objects, and it needs the same two checks: the store returns only
          the caller’s tenant, then the read rule removes drafts they may not see. With a database, push the rule into the
          SQL (<code>WHERE tenant = $1 AND (status = 'published' OR owner = $2 …)</code>) so pagination and counts stay
          correct and nothing extra leaves the database.
        </p>
      </Box>

      <Step n={4}>Run the tests</Step>
      <div className="prose">
        <p>
          The tests prove each rule: every route is 401 without a token, and a forged, expired or malformed token is 401
          with <code>invalid_token</code>; so is a correctly signed token for another audience, or without an expiry, a
          tenant or roles; each user lists only what they may read in their own tenant; another tenant’s document is 404
          on every route (read, update, publish, delete) even for an admin, with the same body as a missing id, and is
          left unchanged; a viewer gets 404 for someone else’s draft on every route; only editors create; tenant and
          owner cannot be set from the body; a missing title is 400, but only after the access checks; only the owner or
          an admin updates; editors publish only in their department; a read-only token cannot use any write route; and
          only admins delete, with the same 403 for every id. Separate policy tests check the rules without HTTP. Each HTTP
          test gets a fresh app with fresh demo data, so the tests do not depend on their order.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/policy.test.ts`, `${T}/node/test/app.test.ts`]}
        python={[`${T}/python/test_policy.py`, `${T}/python/test_app.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/PolicyTests.cs`, `${T}/dotnet/Api.Tests/ApiTests.cs`]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 16\nℹ pass 16\nℹ fail 0' },
          { tag: 'Python', text: '................                                                         [100%]\n16 passed, 1 warning in 0.19s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    16, Skipped:     0, Total:    16, Duration: 847 ms - Api.Tests.dll (net9.0)' },
        ]}
      />
      <div className="prose">
        <p>
          The one Python warning is Starlette’s notice about its test client and httpx, from the shared install; it does not
          affect the tests.
        </p>
      </div>

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>
          At start-up each server prints a token for every demo user, signed with that run’s random key. Paste the
          <code> export</code> lines into the shell where you will run curl. They stop working when the server restarts,
          because the key changes.
        </p>
      </div>
      <Output caption="What the Node.js server prints after it starts (tokens shortened; yours differ every run). Python and .NET print the same lines among their own log messages.">{`
Listening on http://localhost:3000
Test tokens (valid for 1 hour). Paste these lines into your shell:
export ADA=eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J0aCIsInJv…
export BO=eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J0aCIsInJvb…
export CY=eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J0aCIsInJvb…
export DI=eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J0aCIsInJvb…
export EVE=eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJzb3V0aCIsInJv…
export ADA_READONLY=eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnQiOiJub3J…
`}</Output>
      <div className="prose">
        <p>
          In the session below, <code>{"-w ' %{http_code}\\n'"}</code> makes curl print the status code after the body, and
          the last two commands also print the <code>WWW-Authenticate</code> header.
        </p>
      </div>
      <Output caption="The same session against each server (all three answer identically)">{`
$ curl -s localhost:3000/documents -w ' %{http_code}\\n'
{"error":"Missing or invalid token."} 401
$ curl -s localhost:3000/documents -H "Authorization: Bearer $BO"
{"documents":[{"id":"d2","tenant":"north","owner":"ada","department":"sales","title":"Price list","status":"published"}]}
$ curl -s localhost:3000/documents/d1 -H "Authorization: Bearer $BO" -w ' %{http_code}\\n'
{"error":"Document not found."} 404
$ curl -s localhost:3000/documents/d1 -H "Authorization: Bearer $EVE" -w ' %{http_code}\\n'
{"error":"Document not found."} 404
$ curl -s -X POST localhost:3000/documents/d1/publish -H "Authorization: Bearer $CY" -w ' %{http_code}\\n'
{"error":"You are not allowed to do that."} 403
$ curl -s -X POST localhost:3000/documents/d1/publish -H "Authorization: Bearer $ADA" -w ' %{http_code}\\n'
{"id":"d1","tenant":"north","owner":"ada","department":"sales","title":"Sales plan","status":"published"} 200
$ curl -s -X POST localhost:3000/documents -H "Authorization: Bearer $ADA_READONLY" -H 'Content-Type: application/json' -d '{"title":"Team notes"}' -w ' %{http_code}\\n%header{www-authenticate}\\n'
{"error":"This token lacks the documents:write scope."} 403
Bearer error="insufficient_scope", scope="documents:write"
$ curl -s localhost:3000/documents -H "Authorization: Bearer \${ADA}x" -w ' %{http_code}\\n%header{www-authenticate}\\n'
{"error":"Missing or invalid token."} 401
Bearer error="invalid_token"
`}</Output>
      <div className="prose">
        <p>
          Read it line by line: no token is 401; Bo (a viewer) lists only the published document; Bo asking for Ada’s draft
          and Eve (an admin, but of the south tenant) asking for it both get the same 404; Cy is an editor but in support,
          so publishing a sales document is 403; Ada, a sales editor, publishes it; the read-only token cannot create
          anything, even though Ada is an editor; and Ada’s token with one extra character no longer verifies, so it is
          401 with <code>invalid_token</code>.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Checking only that the caller is signed in</td><td>Anyone can read or change any object by editing the id (BOLA, API1:2023)</td><td>Load every object through the tenant and the policy, on every route</td></tr>
          <tr><td>Checking the read route but not the update, publish or delete routes</td><td>BOLA through the route you forgot</td><td>One loader that every route with an id uses, and a test that tries every route as another tenant</td></tr>
          <tr><td>A query without the tenant filter</td><td>One forgotten <code>WHERE</code> leaks another customer’s data</td><td>Make every store method take the tenant; add database row-level security as a second layer</td></tr>
          <tr><td>Taking tenant, owner or role from the body or a header</td><td>The client chooses its own permissions (API3:2023)</td><td>Take them from the verified token or your user table; accept only the fields a user may set</td></tr>
          <tr><td>Hiding buttons as the only control</td><td>The API is still one curl command away</td><td>Enforce on the server; the UI only mirrors the rules</td></tr>
          <tr><td>403 for another tenant’s object</td><td>Confirms the id exists</td><td>404, with the same body as a missing id</td></tr>
          <tr><td>Trusting the role and ignoring the token’s scopes</td><td>A read-only integration can write with the user’s full rights</td><td>Check both: the user may, and the token may</td></tr>
          <tr><td>Rules scattered across handlers</td><td>One route forgets, and nobody can review the whole picture</td><td>One policy module, deny by default, and tests for every rule</td></tr>
          <tr><td>A new role for every combination</td><td>“north-sales-editor” roles multiply until nobody knows what they mean</td><td>Roles for job function; attributes (department, tenant, owner) for context</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="When the rules outgrow a function">
        <p>
          A policy function is right for most APIs. When rules become relationships (“anyone in a group that can view the
          parent folder can view this file”), look at relationship-based access control (ReBAC) systems modeled on
          Google’s Zanzibar, such as OpenFGA or SpiceDB. When many services must share rules written by a security team,
          look at a policy engine such as Open Policy Agent or Cedar. Either way the shape stays the same: your code asks
          “may this user do this action on this resource?” and enforces the answer.
        </p>
      </Box>

      <Checkpoint question="Eve, an admin of the south tenant, requests /documents/d1, which belongs to the north tenant. Why does she get 404 and not 403?">
        <p>
          A 403 would confirm that <code>d1</code> exists, so an attacker could probe ids and map another customer’s data.
          For Eve the north tenant’s documents simply do not exist, so she gets exactly the answer a missing id gets, same
          status and same body. RFC 9110 allows a 404 to hide a forbidden resource. Her admin role does not help, because
          roles apply inside a tenant and the tenant check comes first.
        </p>
      </Checkpoint>
      <Checkpoint question="Ada is an editor. A reporting tool calls the API with a token Ada granted with only documents:read, and tries to create a document. What happens, and why?">
        <p>
          403 with <code>WWW-Authenticate: Bearer error="insufficient_scope", scope="documents:write"</code>. Roles describe
          what Ada may do; scopes describe what this token may do on her behalf. The effective permission is the
          intersection, so the tool can read what Ada can read and nothing more.
        </p>
      </Checkpoint>
      <Checkpoint question="The policy already checks the tenant first. Why does the store’s get() take the tenant as well?">
        <p>
          Defense in depth. If a future route forgets to call the policy, the query still cannot return another tenant’s
          row. It also makes lists correct and cheap: the database filters by tenant, instead of the app loading everyone’s
          rows and filtering afterwards.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack from an empty folder, then add sharing: a
                document gets a <code>sharedWith</code> list of user ids who may read it even as a draft.
              </>
            ),
            hint: <>Add one condition to the read rule only, and add tests: a shared user can read but not update, and sharing with a user from another tenant still gives them 404 (the tenant check comes first).</>,
          },
          {
            task: <>Write one table-driven test that checks the whole permission matrix: every demo user, every action, every seeded document, against an expected yes or no.</>,
            hint: <>Node: a nested loop with <code>test()</code> per row; pytest: <code>@pytest.mark.parametrize</code>; xunit: <code>[Theory]</code> with <code>[MemberData]</code>. A reviewer can then read the rules as a table.</>,
          },
          {
            task: <>Log every denied request (401, 403 and 404 from the policy) with the user id, tenant, route and document id, and never the token.</>,
            hint: <>Node: inside the middleware before answering; Python: in the <code>ApiError</code> handler; .NET: in <code>JsonAuthorizationResultHandler</code> and in <code>DocumentAccess</code>. A burst of 404s across many ids from one user is what BOLA probing looks like.</>,
          },
          {
            task: <>Move tenant isolation into the database with PostgreSQL row-level security, so even a raw query cannot cross tenants.</>,
            hint: <><code>ALTER TABLE documents ENABLE ROW LEVEL SECURITY;</code> then <code>CREATE POLICY tenant_only ON documents USING (tenant = current_setting('app.tenant'));</code> and run <code>SELECT set_config('app.tenant', $1, true)</code> at the start of each request’s transaction (true makes it local to that transaction). The app’s database role must not own the table or have BYPASSRLS.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>Authentication says who is calling; authorization decides what they may do, on every request, on the server.</li>
          <li>401 when the caller is unknown, 403 when they may not do this, 404 when they may not even know the object exists.</li>
          <li>Combine roles (job function), scopes (what the token may do), attribute rules (context) and ownership (this object), and keep them in one policy.</li>
          <li>Check ownership on every read and write, filter every query by the caller’s tenant, and take tenant and owner from the token, never from the request.</li>
        </ul>
      </Recap>
    </>
  );
}
