import { Code } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { clientCredentialsFlow, codeFlow } from '../diagrams/specs/oauth2';

const T = '11-oauth2';

export function OAuth2() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours in one stack"
        project={T}
        learn={[
          'The four OAuth roles, and why OAuth 2.0 is delegated authorization, not sign-in',
          'The authorization code flow with PKCE, step by step: state, code_challenge, iss, short single-use codes and exact redirect URIs',
          'The client credentials grant, for one service calling another with no user involved',
          'How a resource server checks an access token and its scope, and answers with RFC 6750 errors',
          'Why the implicit and password grants are gone, and where token introspection and refresh tokens fit',
        ]}
        tools={[
          { name: 'Node.js', what: 'node:crypto for PKCE, jose to sign and verify RS256 access tokens, Express 5.' },
          { name: 'Python', what: 'hashlib and secrets for PKCE, PyJWT for the access tokens, FastAPI.' },
          { name: '.NET', what: 'System.Security.Cryptography for PKCE, JsonWebTokenHandler to sign, the JwtBearer handler to check tokens.' },
        ]}
      />

      <div className="prose">
        <p>
          A photo-printing site wants to print the photos you keep with another service. The old way was to give the
          printing site your password for the photo service. That gives it everything: your email, your settings, the
          right to delete your account. You cannot take it back without changing your password, and if the printing
          site leaks its database, your password leaks with it.
        </p>
        <p>
          <strong>OAuth 2.0</strong> (RFC 6749) fixes this. The printing site sends you to the photo service, you sign in
          there (the printing site never sees your password), you agree to “let the printing site read my photos”, and
          the photo service gives the printing site an <strong>access token</strong>: a credential that allows exactly
          that and nothing more, for a short time, and that you can revoke on its own.
        </p>
      </div>

      <h2>Four roles</h2>
      <div className="prose">
        <p>Every OAuth flow has the same four parties. This chapter’s project plays all of them:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Role</th><th>What it is</th><th>In this project</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Resource owner</strong></td><td>The user who owns the data and grants access to it</td><td>The test user <code>u-1001</code></td></tr>
          <tr><td><strong>Client</strong></td><td>The application that wants to call the API, for the user or for itself</td><td><code>photo-app</code> (acts for the user) and <code>report-job</code> (acts for itself); <code>album-app</code> is a second user-facing app for the tests</td></tr>
          <tr><td><strong>Authorization server</strong></td><td>Signs the user in, asks for consent, and issues tokens</td><td><code>GET /authorize</code> and <code>POST /token</code></td></tr>
          <tr><td><strong>Resource server</strong></td><td>The API. It accepts access tokens and checks what each one allows</td><td><code>GET /api/photos</code> and <code>GET /api/reports</code></td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>A few more words you will see everywhere:</p>
        <ul>
          <li>
            A <strong>scope</strong> is a named permission the client asks for, such as <code>photos.read</code>. The
            access token lists the scopes it was granted, and the API checks them.
          </li>
          <li>
            A <strong>grant</strong> is a way of getting a token. This chapter builds the two you need today: the
            <strong> authorization code</strong> grant (for a user) and the <strong>client credentials</strong> grant (for
            a service).
          </li>
          <li>
            The <strong>redirect URI</strong> is the client’s address that the authorization server sends the browser back
            to. The client registers it in advance.
          </li>
          <li>
            A <strong>public client</strong> cannot keep a secret (a single-page app or a mobile app: anyone can read
            its code). A <strong>confidential client</strong> can (a back-end server).
          </li>
        </ul>
      </div>

      <Box kind="warn" label="OAuth is delegated authorization, not sign-in">
        <p>
          An access token says “the holder may read these photos”. It is written for the API, not for the client, and
          OAuth says nothing about what is inside it. So “I received an access token” does not prove who the user is,
          or even that the token was issued to your app: a token obtained by some other app for the same user looks just
          as valid. Signing users in needs an extra, verifiable statement about the user, made for your app. That is the
          ID token of OpenID Connect, in chapter 12.
        </p>
      </Box>

      <h2>Which grant, in 2026</h2>
      <TableWrap>
        <thead>
          <tr><th>Grant</th><th>For</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr><td>Authorization code with PKCE</td><td>Any app acting for a user: web, single-page, mobile, desktop</td><td><strong>Use it.</strong> RFC 9700 requires PKCE for public clients and recommends it for confidential ones; the OAuth 2.1 draft requires it for all clients, with one narrow exception</td></tr>
          <tr><td>Client credentials</td><td>A service acting as itself</td><td><strong>Use it.</strong> Prefer <code>private_key_jwt</code> (RFC 7523) or mutual TLS (RFC 8705, chapter 17) over a shared secret where you can</td></tr>
          <tr><td>Device authorization (RFC 8628)</td><td>TVs and command-line tools with no browser</td><td>Use it where it fits</td></tr>
          <tr><td>Refresh token</td><td>A new access token without asking the user again</td><td>Use it, with rotation (chapter 09)</td></tr>
          <tr><td>Implicit (<code>response_type=token</code>)</td><td>Old single-page apps: the token came back in the URL</td><td><strong>Deprecated.</strong> RFC 9700: clients SHOULD NOT use it. Removed in OAuth 2.1</td></tr>
          <tr><td>Resource owner password credentials</td><td>The client collects the user’s password and sends it</td><td><strong>Deprecated.</strong> RFC 9700: it MUST NOT be used. Removed in OAuth 2.1</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The implicit grant put the access token in the URL fragment, where it leaks into browser history, logs and
          <code> Referer</code> headers, and an attacker can inject a stolen token; there is no way to bind it to the
          client. The password grant trains users to type their password into other apps (exactly what OAuth was invented
          to stop), and it cannot do multi-factor sign-in or passkeys. The code flow with PKCE covers both use cases
          safely, so the project’s token endpoint simply answers <code>unsupported_grant_type</code>.
        </p>
      </div>

      <h2>The authorization code flow with PKCE</h2>
      <div className="prose">
        <p>
          The user’s browser carries two messages (the request to the authorization server and the code coming back);
          the token itself travels only on a direct, back-channel call from the client to the authorization server. Two
          random values protect the browser legs:
        </p>
        <ul>
          <li>
            <strong>state</strong>: a random value the client stores in the user’s session and sends with the request. The
            callback must bring the same value back. If it does not, the callback was not started by this browser: an
            attacker is trying to log the victim into the attacker’s account (login CSRF), and the client stops.
          </li>
          <li>
            <strong>PKCE</strong> (Proof Key for Code Exchange, RFC 7636): the client makes a random
            <strong> code_verifier</strong>, keeps it, and sends only its SHA-256 hash, the <strong>code_challenge</strong>,
            in the request (<code>code_challenge_method=S256</code>). To redeem the code it must present the verifier. A
            stolen code (from a log, a malicious app registered for the same redirect URI, a leaked
            <code> Referer</code>) is useless without it.
          </li>
        </ul>
      </div>
      <Diagram spec={codeFlow} caption="The browser carries the request and the code; the token comes back on a direct call that also proves the client holds the PKCE verifier." />

      <Step n={1}>PKCE and the client registry</Step>
      <div className="prose">
        <p>
          PKCE is two lines: a 32-byte random verifier (43 base64url characters), and its SHA-256 in base64url without
          padding. The tests check it against the worked example in RFC 7636, Appendix B. The same file has the random
          token used for codes and state, and a constant-time string comparison.
        </p>
        <p>
          The registry lists what the authorization server knows about each client: its exact redirect URIs, the scopes it
          may ask for, the grants it may use and, for confidential clients, a hash of its secret.
          <code> photo-app</code> and <code>album-app</code> are public (no secret); <code>report-job</code> is
          confidential.
        </p>
      </div>
      <StackFiles
        label="PKCE and the registered clients"
        node={[`${T}/node/src/pkce.ts`, `${T}/node/src/clients.ts`]}
        python={[`${T}/python/pkce.py`, `${T}/python/clients.py`]}
        dotnet={[`${T}/dotnet/Api/Pkce.cs`, `${T}/dotnet/Api/Clients.cs`]}
      />

      <Step n={2}>The authorization server: /authorize and /token</Step>
      <div className="prose">
        <p>
          <code>GET /authorize</code> checks things in a deliberate order. First the <code>client_id</code> and the
          <code> redirect_uri</code>: until both are known to be good, the server must not redirect anywhere, or it
          becomes an open redirector that delivers codes to an attacker. So these two errors are shown as a
          <code> 400</code> page. The redirect URI is compared as an <strong>exact string</strong>, as RFC 9700 requires: a
          trailing slash, an extra query string or another port is a different address. (The one exception RFC 9700
          allows is the port of a loopback address such as <code>http://127.0.0.1:51004/callback</code>, which a desktop
          app picks at run time; RFC 8252 covers those apps.) After that, errors go back to the client in the redirect
          (<code>error</code>, <code>error_description</code> and the <code>state</code>): only
          <code> response_type=code</code> is accepted, PKCE with <code>S256</code> is required (<code>plain</code> would put
          the verifier itself in the URL), and every scope must be one the client may ask for.
        </p>
        <p>
          A real server would now show its sign-in page and a consent screen. This one signs in the test user at once,
          then stores the <strong>code</strong> with everything it is bound to: the client, the redirect URI, the
          challenge, the scope, the user and an expiry 60 seconds away (RFC 6749 recommends 10 minutes at most; shorter
          is better). Every redirect back to the client, success or error, also carries <code>iss</code>, the server’s
          <strong> issuer identifier</strong> (its own URL, <code>http://localhost:3000</code> here), as RFC 9207 describes:
          it tells the client which server the response came from.
        </p>
        <p><code>POST /token</code> takes a form body (<code>application/x-www-form-urlencoded</code>) and:</p>
        <ul>
          <li>refuses any grant other than <code>authorization_code</code> and <code>client_credentials</code>;</li>
          <li>
            authenticates the client: a confidential client sends its id and secret in an HTTP Basic header
            (<code>client_secret_basic</code>) or in the form (<code>client_secret_post</code>), and a public client sends
            only its <code>client_id</code>;
          </li>
          <li>
            for a code: removes it from the store <em>before</em> checking anything about it, so it can be tried exactly once, then
            checks its expiry, that it was issued to this client, that <code>redirect_uri</code> matches the request, and
            that SHA-256 of <code>code_verifier</code> equals the stored challenge;
          </li>
          <li>
            for a code that was already redeemed: refuses it like any bad code, and also revokes the access token the
            first redemption produced. A second use means the code leaked, so whoever holds that token may not be the
            user’s app; RFC 6749 section 4.1.2 says the server should revoke it. The server remembers each redeemed code,
            with the <code>jti</code> (JWT ID) of its token, for as long as that token lives;
          </li>
          <li>
            for client credentials: checks the requested scopes against the client’s and issues a token whose subject is
            the client itself, with no refresh token (RFC 6749 section 4.4.3: the client can simply ask again);
          </li>
          <li>sends <code>Cache-Control: no-store</code>, because a token in a cache is a token anyone can read.</li>
        </ul>
        <p>
          The access token is a JWT in the shape of RFC 9068: header <code>typ: at+jwt</code>, and the claims
          <code> iss</code>, <code>sub</code>, <code>aud</code>, <code>client_id</code>, <code>scope</code>,
          <code> iat</code>, <code>exp</code> and <code>jti</code>, signed with RS256 (chapter 08 covers JWTs in depth). The
          <code> jti</code> is a random id for this one token; it is how the server names a token it revokes.
        </p>
      </div>
      <StackFiles
        label="The authorization server"
        node={`${T}/node/src/authorization-server.ts`}
        python={`${T}/python/authorization_server.py`}
        dotnet={`${T}/dotnet/Api/AuthorizationServer.cs`}
      />
      <Box kind="key" label="Do not build your own authorization server">
        <p>
          This one exists so you can see every check. A production authorization server also needs sign-in, consent,
          key rotation, revocation, rate limits, audit logs and years of hardening. Use Microsoft Entra ID, Okta, Auth0,
          Keycloak, or a library built for it (Duende IdentityServer or OpenIddict in .NET, Authlib’s server in Python,
          node-oidc-provider in Node.js). Your job is usually the client and the resource server.
        </p>
      </Box>

      <Step n={3}>The resource server: check the token, then the scope</Step>
      <div className="prose">
        <p>
          The API trusts nothing about a token until it has checked it: the signature against the authorization server’s
          key, the algorithm (RS256 only), the issuer, the audience (<code>photo-api</code>: a token for another API is
          refused), the type (<code>at+jwt</code>, so an ID token cannot be replayed here), the expiry against the
          clock, and that its <code>jti</code> has not been revoked. Then it checks that the token carries the scope this
          endpoint needs. Failures follow RFC 6750:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Problem</th><th>Status</th><th><code>WWW-Authenticate</code></th></tr>
        </thead>
        <tbody>
          <tr><td>No token at all</td><td>401</td><td><code>Bearer</code> (no error code, as RFC 6750 asks)</td></tr>
          <tr><td>Bad signature, wrong issuer, audience or type, expired, revoked</td><td>401</td><td><code>Bearer error="invalid_token"</code></td></tr>
          <tr><td>Valid token without the needed scope</td><td>403</td><td><code>Bearer error="insufficient_scope", scope="photos.read"</code></td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Node.js and Python check the token in a few lines of their own (an Express middleware, a FastAPI dependency).
          .NET uses ASP.NET Core’s <code>JwtBearer</code> handler with the same rules, its <code>OnTokenValidated</code>
          event for the revocation check, and an endpoint filter for the scope. All three take a clock, so the tests can
          move time past the token’s expiry (.NET checks expiry in a small <code>LifetimeValidator</code>, because
          <code> TokenValidationParameters.TimeProvider</code> is not public in IdentityModel 8.19.2, the version the
          9.0.21 JwtBearer package brings in). In one process for the lab, the resource server is handed the authorization server’s public key and
          reads its list of revoked tokens directly. A separate API would fetch the key from the authorization server’s
          JWKS URL (in .NET, set <code>options.Authority</code> and the handler does it), and would learn about revoked
          tokens by asking the server (token introspection, below) or from a deny list the server publishes.
        </p>
      </div>
      <StackFiles
        label="The resource server and the app"
        node={[`${T}/node/src/resource-server.ts`, `${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={[`${T}/python/resource_server.py`, `${T}/python/app.py`]}
        dotnet={[`${T}/dotnet/Api/ResourceServer.cs`, `${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />

      <Step n={4}>The client</Step>
      <div className="prose">
        <p>
          The client side is written by hand so you can see it: <code>start</code> makes a fresh state and verifier and
          builds the URL to send the browser to; the app keeps both values in the user’s session.
          <code> finish</code> runs when the browser comes back: it compares the state <em>first</em> (an error response
          with the wrong state is ignored too), then checks that <code>iss</code> is exactly the issuer it expects, and
          only then posts the code with the verifier to <code>/token</code>. <code>clientCredentials</code> is one POST
          with a Basic header. In a real app a maintained library does these steps for you; the shapes are the same.
        </p>
        <p>
          The <code>iss</code> check stops a <strong>mix-up attack</strong>. A client that works with several
          authorization servers (say, “Sign in with A” and “Sign in with B”) can be tricked into sending a code it
          received from one server to the token endpoint of another, attacker-controlled one. With <code>iss</code> in
          the response, the client knows which server answered. RFC 9700 says a client that talks to more than one
          authorization server must use <code>iss</code> (RFC 9207) or a separate redirect URI for each server; a client
          with only one server is not exposed, but the check costs one comparison.
        </p>
      </div>
      <StackFiles
        label="The client"
        node={`${T}/node/src/client.ts`}
        python={`${T}/python/client.py`}
        dotnet={`${T}/dotnet/Api/OAuthClient.cs`}
      />

      <h2>Client credentials: a service calling an API</h2>
      <div className="prose">
        <p>
          When no user is involved, such as a nightly job that reads reports, the client authenticates as itself and asks
          for a token directly. There is no browser, no redirect, no code and no consent screen: the scopes a service may
          get are set when it is registered. The token’s <code>sub</code> is the client’s own id, so the API can tell a
          service from a user.
        </p>
      </div>
      <Diagram spec={clientCredentialsFlow} caption="Client credentials: one call to /token with the client’s own credentials, then the same Bearer call to the API." />
      <Box kind="tip" label="A secret is the weakest client credential">
        <p>
          A client secret is a password for a machine: it travels with every token request and must be stored and rotated.
          RFC 9700 recommends asymmetric client authentication instead: <code>private_key_jwt</code> (RFC 7523), where the
          client signs a short JWT with its private key and the server holds only the public key, or mutual TLS (RFC 8705,
          chapter 17). On Azure, a managed identity removes the secret altogether.
        </p>
      </Box>

      <h2>Self-contained tokens or introspection</h2>
      <div className="prose">
        <p>
          The project’s access tokens are JWTs: the API checks them alone, with a public key. The other design is an
          <strong> opaque</strong> token (a random string) that only the authorization server can read; the API asks about
          each one with <strong>token introspection</strong> (RFC 7662): <code>POST /introspect</code> with the token, and
          the answer is <code>{'{"active": true, "scope": "...", "sub": "...", "exp": ...}'}</code> or
          <code> {'{"active": false}'}</code>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>JWT access token (RFC 9068)</th><th>Opaque token + introspection (RFC 7662)</th></tr>
        </thead>
        <tbody>
          <tr><td>Checking a token</td><td>Local: signature and claims, no network call</td><td>A call to the authorization server (cache the answer briefly)</td></tr>
          <tr><td>Revoking a token</td><td>Takes effect at expiry, unless the API also checks a deny list (this project’s API reads the server’s list)</td><td>Immediate: the next introspection says inactive</td></tr>
          <tr><td>What the client can see</td><td>Anyone holding it can decode the claims</td><td>Nothing: it is a random string</td></tr>
          <tr><td>Size</td><td>Hundreds of bytes</td><td>Tens of bytes</td></tr>
          <tr><td>Good for</td><td>High-volume APIs, many services</td><td>Few APIs, strict revocation, privacy</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Either way, keep access tokens short-lived (minutes, not days). A <strong>refresh token</strong> lets the client
          get a new access token without sending the user through the flow again: the token endpoint returns one next to
          the access token (with OpenID Connect, usually when the client asks for the <code>offline_access</code> scope),
          and the client later posts <code>grant_type=refresh_token</code>. Chapter 09 builds refresh tokens with rotation
          and reuse detection; the same rules apply here.
        </p>
      </div>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          The tests drive the whole flow over HTTP and play the browser themselves: they follow the redirect to
          <code> /authorize</code> without following the one back, read the code from the <code>Location</code> header, and
          hand it to the client. Then they break each rule: a wrong verifier (which also burns the code), a reused code
          (which also revokes the first token), a code presented by another client, an expired code, look-alike redirect
          URIs at both endpoints, a forged state, a missing or wrong <code>iss</code>, a request without PKCE or with
          <code> plain</code>, a scope the client may not ask for, a wrong client secret, a broken Basic header, a public
          client asking for client credentials, the password grant, and tokens that are missing, forged, expired, lack
          the scope, or are signed with the right key but carry the wrong audience, type or issuer. For that last case
          the test generates the server’s signing key itself and passes it to the app, so only the claim under test is
          wrong.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/setup.ts`, `${T}/node/test/pkce.test.ts`, `${T}/node/test/code-flow.test.ts`, `${T}/node/test/client-credentials.test.ts`, `${T}/node/test/resource-server.test.ts`]}
        python={[`${T}/python/harness.py`, `${T}/python/test_pkce.py`, `${T}/python/test_code_flow.py`, `${T}/python/test_client_credentials.py`, `${T}/python/test_resource_server.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/Lab.cs`, `${T}/dotnet/Api.Tests/PkceTests.cs`, `${T}/dotnet/Api.Tests/CodeFlowTests.cs`, `${T}/dotnet/Api.Tests/ClientCredentialsTests.cs`, `${T}/dotnet/Api.Tests/ResourceServerTests.cs`]}
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
          { tag: 'Python', text: '.................                [100%]\n17 passed, 1 warning' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 17, Skipped: 0, Total: 17' },
        ]}
      />
      <div className="prose">
        <p>
          The one Python warning is Starlette’s notice that its test client will move from <code>httpx</code> to
          <code> httpx2</code>; it comes from the shared environment, not from this project.
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
          Here you are the browser and the client. The session uses the verifier and challenge from RFC 7636, so you can
          type them; a real client makes new ones every time. Port 4000, the redirect URI, does not need to be running:
          you only read the code from the <code>Location</code> header. Run it against any of the three servers; only the
          codes, the token values, the order of the claims and the case of header names (Python’s server prints them in
          lower case) differ.
        </p>
      </div>
      <Output caption="The code flow, a reused code that also revokes its token, client credentials, a missing scope and the password grant (Node.js server)">{`
$ curl -s -i "localhost:3000/authorize?response_type=code&client_id=photo-app&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fcallback&scope=photos.read&state=af0ifjsldkj&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256" | grep -i -E '^(HTTP|location)'
HTTP/1.1 302 Found
Location: http://localhost:4000/callback?code=jsT5eSDCGrVoeQe-VRO8jLfmoVqtAy_9xBkGAhmaCWk&state=af0ifjsldkj&iss=http%3A%2F%2Flocalhost%3A3000
$ CODE=jsT5eSDCGrVoeQe-VRO8jLfmoVqtAy_9xBkGAhmaCWk
$ curl -s localhost:3000/token -d grant_type=authorization_code -d code=$CODE -d redirect_uri=http://localhost:4000/callback -d client_id=photo-app -d code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk > token.json
$ jq -c '.access_token |= .[:24] + "..."' token.json
{"access_token":"eyJhbGciOiJSUzI1NiIsInR5...","token_type":"Bearer","expires_in":600,"scope":"photos.read"}
$ TOKEN=$(jq -r .access_token token.json)
$ for part in 1 2; do cut -d. -f$part <<< "$TOKEN" | tr "_-" "/+" | jq -cR "@base64d | fromjson"; done
{"alg":"RS256","typ":"at+jwt"}
{"client_id":"photo-app","scope":"photos.read","iss":"http://localhost:3000","sub":"u-1001","aud":"photo-api","iat":1792298342,"exp":1792298942,"jti":"AbPuSoSPgh611hqitlYnJQ"}
$ curl -s localhost:3000/api/photos -H "Authorization: Bearer $TOKEN"
{"owner":"u-1001","photos":["beach.jpg","hills.jpg"]}
$ curl -s localhost:3000/token -d grant_type=authorization_code -d code=$CODE -d redirect_uri=http://localhost:4000/callback -d client_id=photo-app -d code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
{"error":"invalid_grant","error_description":"The code is invalid, expired or already used."}
$ curl -s -i localhost:3000/api/photos -H "Authorization: Bearer $TOKEN" | grep -i -E '^(HTTP|www-authenticate|\\{)'
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"
{"error":"invalid_token","error_description":"The access token is invalid or expired."}
$ curl -s localhost:3000/token -u report-job:report-job-secret -d grant_type=client_credentials -d scope=reports.read > service.json
$ jq -c '.access_token |= .[:24] + "..."' service.json
{"access_token":"eyJhbGciOiJSUzI1NiIsInR5...","token_type":"Bearer","expires_in":600,"scope":"reports.read"}
$ SERVICE=$(jq -r .access_token service.json)
$ curl -s localhost:3000/api/reports -H "Authorization: Bearer $SERVICE"
{"client":"report-job","reports":["daily-sales.csv"]}
$ curl -s -i localhost:3000/api/photos -H "Authorization: Bearer $SERVICE" | grep -i -E '^(HTTP|www-authenticate|\\{)'
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_scope", scope="photos.read"
{"error":"insufficient_scope","error_description":"This call needs the photos.read scope."}
$ curl -s localhost:3000/token -d grant_type=password -d client_id=photo-app -d username=ada@example.com -d password=hunter2
{"error":"unsupported_grant_type","error_description":"Use authorization_code or client_credentials."}
`}</Output>
      <Output
        caption="The decoded access token from each server"
        panes={[
          { tag: 'Node.js (jose)', text: '{"alg":"RS256","typ":"at+jwt"}\n{"client_id":"photo-app","scope":"photos.read","iss":"http://localhost:3000","sub":"u-1001","aud":"photo-api","iat":1792298342,"exp":1792298942,"jti":"AbPuSoSPgh611hqitlYnJQ"}' },
          { tag: 'Python (PyJWT)', text: '{"alg":"RS256","typ":"at+jwt"}\n{"iss":"http://localhost:3000","sub":"u-1001","aud":"photo-api","client_id":"photo-app","scope":"photos.read","iat":1792298342,"exp":1792298942,"jti":"Td0bmwYxXKGIc5xPAUD-iQ"}' },
          { tag: '.NET (IdentityModel)', text: '{"alg":"RS256","typ":"at+jwt"}\n{"aud":"photo-api","iss":"http://localhost:3000","exp":1792298942,"iat":1792298342,"sub":"u-1001","client_id":"photo-app","scope":"photos.read","jti":"pquEN-JwHpbNQedzPESXcw"}' },
        ]}
      />
      <div className="prose">
        <p>
          The redirect carries <code>iss</code> next to the code and the state. The second redemption of the same code
          fails, because codes are single-use, and it also costs the first token its life: the same photos call that
          worked a moment earlier now gets <code>401</code>. The service token reads reports but gets a <code>403</code>{' '}
          on photos, with the missing scope named in the header, so a client can tell “ask for more scope” from “your
          token is bad”.
        </p>
      </div>

      <h2>With a real authorization server</h2>
      <div className="prose">
        <p>
          Against a real server, the client side is a library call, and the resource server points its JWT handler at the
          server’s issuer. These snippets show the shape; they are configuration for your own environment, not part of the
          tested project.
        </p>
      </div>
      <ByStack
        label="Client credentials against a real authorization server (not run by the tests)"
        node={
          <Code title="service-client.ts: configuration, not run by the tests">{`
import * as client from 'openid-client';

// Discovery reads https://login.example.com/.well-known/openid-configuration (or the OAuth metadata document).
const config = await client.discovery(new URL('https://login.example.com'), 'report-job', process.env.CLIENT_SECRET!);
const tokens = await client.clientCredentialsGrant(config, { scope: 'reports.read' });
await fetch('https://api.example.com/api/reports', { headers: { Authorization: \`Bearer \${tokens.access_token}\` } });
`}</Code>
        }
        python={
          <Code title="service_client.py: configuration, not run by the tests" lang="python">{`
import os

from authlib.integrations.httpx_client import OAuth2Client

client = OAuth2Client("report-job", os.environ["CLIENT_SECRET"], scope="reports.read")
token = client.fetch_token("https://login.example.com/oauth2/token", grant_type="client_credentials")
client.get("https://api.example.com/api/reports")  # sends Authorization: Bearer <access token>
`}</Code>
        }
        dotnet={
          <Code title="Program.cs (resource server): configuration, not run by the tests" lang="csharp">{`
// The API side: the handler downloads the issuer's metadata and JWKS, caches them, and refreshes on a new kid.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = "https://login.example.com";   // the issuer
        o.Audience = "photo-api";                     // this API's identifier at the server
        o.MapInboundClaims = false;
    });
// The client side in .NET: the Duende.IdentityModel package's RequestClientCredentialsTokenAsync,
// or MSAL's AcquireTokenForClient for Microsoft Entra ID.
`}</Code>
        }
      />

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>The implicit or password grant</td><td>Tokens in URLs and history; users typing passwords into other apps</td><td>The code flow with PKCE</td></tr>
          <tr><td>Prefix, wildcard or “same host” redirect URI matching</td><td>Codes delivered to an attacker’s page on a look-alike address</td><td>Exact string match against registered URIs</td></tr>
          <tr><td>No state, no PKCE, or PKCE <code>plain</code></td><td>Login CSRF; stolen or injected codes can be redeemed</td><td>A one-time state per sign-in, and PKCE with S256</td></tr>
          <tr><td>Long-lived or reusable codes</td><td>A leaked code works later, or twice</td><td>About a minute, single-use, bound to client, redirect URI and challenge; on reuse, revoke what the code gave</td></tr>
          <tr><td>A client of several authorization servers that ignores <code>iss</code></td><td>Mix-up: a code from one server is sent to an attacker’s token endpoint</td><td>Check <code>iss</code> (RFC 9207), or give each server its own redirect URI</td></tr>
          <tr><td>A client secret in a single-page or mobile app</td><td>Anyone can read it from the code</td><td>A public client with PKCE, or a back end that holds the tokens</td></tr>
          <tr><td>The API checks only the signature</td><td>Accepts tokens meant for other APIs, expired ones, ID tokens</td><td>Check <code>iss</code>, <code>aud</code>, <code>exp</code>, <code>typ</code> and the scope</td></tr>
          <tr><td>Using an access token as proof of who signed in</td><td>Another app’s token for the same user is accepted (token substitution)</td><td>OpenID Connect and its ID token (chapter 12)</td></tr>
          <tr><td>Long-lived access tokens</td><td>A leaked token works for days and cannot be recalled</td><td>Minutes, plus refresh tokens with rotation (chapter 09)</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="One more defense worth knowing">
        <p>
          A bearer token works for whoever holds it. <strong>Sender-constrained tokens</strong> stop a stolen access token
          from working at all: DPoP (RFC 9449) binds it to a key the client holds and proves with every request, mutual
          TLS (RFC 8705, chapter 17) to the client’s certificate.
        </p>
      </Box>

      <Checkpoint question="A malicious app on the user’s phone registers the same custom URL scheme as your app and receives the authorization code. Why can it not get a token?">
        <p>
          Because of PKCE. Redeeming the code requires the <code>code_verifier</code>, and the verifier never left your
          app: only its SHA-256 hash traveled in the authorization request. The authorization server hashes whatever
          verifier it receives and compares it with the stored challenge, so the stolen code is useless. In the project,
          one wrong verifier even burns the code.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does /authorize show a 400 error for an unregistered redirect_uri instead of redirecting there with error=invalid_request?">
        <p>
          Redirecting to an address the server has not verified would make it an open redirector: an attacker could send
          users through your trusted sign-in domain to any page, and an error-redirect is one step from a code-redirect.
          RFC 6749 section 4.1.2.1 says that when the client or redirect URI is invalid, the server must not redirect and
          should tell the user instead. Only after both are verified do errors travel back to the client.
        </p>
      </Checkpoint>
      <Checkpoint question="photo-app now has an access token. Can it read the token to find out who the user is?">
        <p>
          Not reliably. The token is written for the API (its audience is <code>photo-api</code>); OAuth does not define
          its format for clients, and many servers issue opaque tokens. Even with a JWT, the client cannot tell that the
          token was issued to it rather than to another app. To learn who signed in, use OpenID Connect: the ID token is
          addressed to your app and you validate it (chapter 12).
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then add <code>POST /introspect</code>
                (RFC 7662) and switch <code>/api/reports</code> to ask it about each token instead of verifying the JWT.
              </>
            ),
            hint: <>Register the API as a confidential client that may introspect. Answer <code>{'{"active": false}'}</code> for anything unknown, expired or malformed, with no other detail; for active tokens return <code>scope</code>, <code>client_id</code>, <code>sub</code> and <code>exp</code>.</>,
          },
          {
            task: <>Publish authorization server metadata (RFC 8414) at <code>/.well-known/oauth-authorization-server</code>, and make the client read the endpoints and the issuer from it instead of from its own settings.</>,
            hint: <>Include <code>issuer</code>, <code>authorization_endpoint</code>, <code>token_endpoint</code>, <code>code_challenge_methods_supported: ["S256"]</code> and <code>authorization_response_iss_parameter_supported: true</code>. The client must check that the document’s <code>issuer</code> equals the URL it started from, then expect that <code>iss</code> in every authorization response. OpenID Connect discovery (chapter 12) is the same idea.</>,
          },
          {
            task: <>Return a refresh token from the code flow and add <code>grant_type=refresh_token</code>, with rotation and reuse detection from chapter 09.</>,
            hint: <>Store only a hash of each refresh token, bound to the client and the granted scope. A refresh may narrow the scope, never widen it.</>,
          },
          {
            task: <>Replace <code>report-job</code>’s secret with <code>private_key_jwt</code> (RFC 7523).</>,
            hint: <>The client signs a JWT with <code>iss</code> and <code>sub</code> set to its client_id, <code>aud</code> set to the token endpoint, a short <code>exp</code> and a unique <code>jti</code>, and sends it as <code>client_assertion</code> with <code>client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer</code>. The server verifies it with the registered public key and rejects a repeated <code>jti</code>.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>OAuth 2.0 lets a client call an API with a limited, revocable access token instead of the user’s password. It is delegated authorization, not sign-in.</li>
          <li>For users, use the authorization code flow with PKCE (S256) and a state; for services, client credentials. Never the implicit or password grants.</li>
          <li>The authorization server matches redirect URIs exactly, issues short, single-use codes bound to the client, the redirect URI and the challenge, revokes the token of a code used twice, and names itself with <code>iss</code> in every redirect.</li>
          <li>The resource server checks signature, issuer, audience, type, expiry, revocation and scope, and answers 401 or 403 with an RFC 6750 <code>WWW-Authenticate</code> header.</li>
          <li>JWT access tokens are checked locally; opaque tokens with introspection revoke at once. Keep either short-lived and refresh with rotation.</li>
        </ul>
      </Recap>
    </>
  );
}
