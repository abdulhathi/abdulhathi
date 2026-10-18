import { Code } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { oidcSignIn } from '../diagrams/specs/oidc';

const T = '12-oidc';

export function Oidc() {
  return (
    <>
      <ChapterIntro
        time="3.5–4 hours in one stack"
        project={T}
        learn={[
          'What OpenID Connect adds to OAuth 2.0: the ID token, and why an access token must never be used to sign in',
          'Discovery and JWKS: how your app finds a provider’s endpoints and signing keys',
          'The sign-in: the code flow with PKCE, state and nonce, ending in a session of your own',
          'Validating an ID token fully: signature by kid, iss, aud, azp, exp, iat and nonce',
          'The UserInfo endpoint and RP-initiated logout',
          'Configuring Microsoft Entra ID, Google, Okta and Keycloak',
        ]}
        tools={[
          { name: 'Node.js', what: 'openid-client 6 with express-session; jose for the mock provider.' },
          { name: 'Python', what: 'Authlib’s Starlette client with SessionMiddleware; PyJWT for the mock provider.' },
          { name: '.NET', what: 'ASP.NET Core’s AddOpenIdConnect and AddCookie handlers; JsonWebTokenHandler for the mock provider.' },
        ]}
      />

      <div className="prose">
        <p>
          “Sign in with Microsoft” and “Sign in with Google” let your app skip passwords altogether. The user signs in at
          a provider they already trust, with their own password, passkey and second factor, and the provider tells your
          app who they are. You store no passwords, and a company can switch an employee off in one place.
        </p>
        <p>
          Chapter 11 showed why plain OAuth 2.0 cannot do this safely: an access token is written for an API, not for
          your app, and proves nothing about who signed in. <strong>OpenID Connect</strong> (OIDC, OpenID Connect Core 1.0)
          is a thin layer on OAuth 2.0 that adds exactly the missing piece: the <strong>ID token</strong>, a signed JWT
          addressed to your app that says which user signed in, at which provider, and when.
        </p>
      </div>

      <h2>The words, and the two tokens</h2>
      <div className="prose">
        <ul>
          <li>
            The <strong>OpenID provider</strong> (OP), usually called the <strong>identity provider</strong> (IdP), is the
            OAuth authorization server that also signs users in: Entra ID, Google, Okta, Keycloak.
          </li>
          <li>The <strong>relying party</strong> (RP) is your app: it relies on the provider’s word about the user.</li>
          <li>
            A <strong>claim</strong> is one statement in a token, such as <code>"sub": "u-1001"</code>. <code>sub</code>
            (subject) is the user’s stable, unique id at that provider; <code>iss</code> is the provider.
          </li>
          <li>Asking for the scope <code>openid</code> is what turns an OAuth request into an OIDC sign-in.</li>
        </ul>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>ID token</th><th>Access token</th></tr>
        </thead>
        <tbody>
          <tr><td>Defined by</td><td>OpenID Connect Core 1.0</td><td>OAuth 2.0 (RFC 6749); its JWT form in RFC 9068</td></tr>
          <tr><td>Audience (<code>aud</code>)</td><td>Your app: its <code>client_id</code></td><td>The API (resource server)</td></tr>
          <tr><td>Says</td><td>Who signed in, at which provider, when, and for which request (<code>nonce</code>)</td><td>What the holder may do (scopes)</td></tr>
          <tr><td>Format</td><td>Always a signed JWT</td><td>A JWT or an opaque string: your app must not care</td></tr>
          <tr><td>Checked by</td><td>Your app, once, at sign-in</td><td>The API, on every request</td></tr>
          <tr><td>Send it to APIs?</td><td>No</td><td>Yes, as a Bearer token (here: to the UserInfo endpoint)</td></tr>
        </tbody>
      </TableWrap>

      <h2>How sign-in works</h2>
      <div className="prose">
        <p>
          It is the authorization code flow with PKCE from chapter 11, plus three things: the <code>openid</code> scope, a
          <strong> nonce</strong>, and an ID token in the token response. The <strong>nonce</strong> is a random value your
          app makes for each sign-in, keeps in the user’s session, and sends in the request; the provider copies it into
          the ID token. When the ID token arrives, your app checks it is the same value. That binds the ID token to this
          browser’s sign-in, so an ID token captured elsewhere, or one produced from a code an attacker injected, is
          refused. <code>state</code> still protects the callback, and PKCE still protects the code.
        </p>
      </div>
      <Diagram spec={oidcSignIn} caption="The OIDC sign-in: the code flow with PKCE, state and nonce, an ID token checked against the provider’s published keys, then a session of your own." />

      <h3>Discovery and JWKS</h3>
      <div className="prose">
        <p>
          Your app is configured with one URL: the provider’s <strong>issuer</strong>. Everything else comes from the
          <strong> discovery document</strong> (OpenID Connect Discovery 1.0) at
          <code> {'{issuer}'}/.well-known/openid-configuration</code>: the authorization, token, UserInfo and logout
          endpoints, the supported scopes and algorithms, and the <code>jwks_uri</code>. The <code>issuer</code> inside the
          document must be exactly the URL you started from. The <strong>JWKS</strong> (JSON Web Key Set, RFC 7517) at
          <code> jwks_uri</code> lists the provider’s public signing keys, each with a <strong>key id</strong>
          (<code>kid</code>). Every ID token names its key in its header, so the provider can rotate keys: it publishes
          the new key first, then starts signing with it. Libraries cache the JWKS and fetch it again when a token names
          a <code>kid</code> they do not know.
        </p>
      </div>

      <h3>Validating the ID token</h3>
      <div className="prose">
        <p>OpenID Connect Core section 3.1.3.7 lists the checks:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Check</th><th>Rule</th><th>What it stops</th></tr>
        </thead>
        <tbody>
          <tr><td>Signature</td><td>Find the key by <code>kid</code> in the JWKS; verify with an allowed algorithm (RS256 here)</td><td>Forged or altered tokens</td></tr>
          <tr><td><code>iss</code></td><td>Exactly the issuer from discovery</td><td>Tokens from another provider or tenant</td></tr>
          <tr><td><code>aud</code></td><td>Contains your <code>client_id</code></td><td>A token issued to another app being replayed at yours</td></tr>
          <tr><td><code>azp</code></td><td>Should be present when <code>aud</code> lists several audiences; when present, should equal your <code>client_id</code></td><td>Tokens issued to another party</td></tr>
          <tr><td><code>exp</code></td><td>In the future (allow a little clock skew)</td><td>Replaying old tokens</td></tr>
          <tr><td><code>iat</code></td><td>Present; you may refuse one too far from now (how far is your choice)</td><td>Tokens kept and replayed long after they were made</td></tr>
          <tr><td><code>nonce</code></td><td>Equal to the value stored for this sign-in</td><td>Replay and code injection</td></tr>
          <tr><td>UserInfo <code>sub</code></td><td>Equal to the ID token’s <code>sub</code> (Core section 5.3.2)</td><td>Mixing one user’s profile into another’s sign-in</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Authlib checks aud only indirectly">
        <p>
          Authlib’s ID token class enforces the issuer from discovery, but checks <code>aud</code> only through its
          <code> azp</code> rule: in Authlib 1.9.1 an ID token for <code>another-app</code> that carries
          <code> "azp": "web-app"</code> passes and signs the user in. So the Python project passes
          <code> claims_options</code> requiring both <code>iss</code> and <code>aud</code> (passing any
          <code> claims_options</code> replaces Authlib’s default issuer check, so name <code>iss</code> too).
          openid-client and ASP.NET Core check <code>aud</code> against your client id by default. The projects’
          wrong-audience test sends exactly that token to all three.
        </p>
      </Box>

      <h3>The libraries, and why there is no hand-written validation</h3>
      <div className="prose">
        <p>
          Each stack uses the standard client library. All three work against a local provider over plain HTTP with one
          setting, and with the settings below they make the required checks in the table above, so the projects
          validate nothing by hand. Where they differ is in the defaults, so know yours. If a library
          ever refused to run locally (some insist on HTTPS or a public issuer), you would test your configuration
          against the mock with that library’s own escape hatch, never by writing a second validator that production does
          not use.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Node.js: openid-client 6</th><th>Python: Authlib 1.9</th><th>.NET: AddOpenIdConnect</th></tr>
        </thead>
        <tbody>
          <tr><td>Discovery and JWKS</td><td><code>discovery(issuer, …)</code></td><td><code>server_metadata_url</code></td><td><code>Authority</code></td></tr>
          <tr><td>state, nonce, PKCE</td><td>You make them (<code>randomState</code>, <code>randomNonce</code>, <code>randomPKCECodeVerifier</code>) and keep them in the session</td><td>Made and kept in the session by <code>authorize_redirect</code></td><td>Made by the handler; kept in an encrypted <code>state</code> and a nonce cookie</td></tr>
          <tr><td>ID token signature</td><td>Only with <code>enableNonRepudiationChecks</code>; otherwise it relies on TLS to the token endpoint, which Core 3.1.3.7 allows</td><td>Always</td><td>Always</td></tr>
          <tr><td><code>aud</code></td><td>Always</td><td>Only through <code>azp</code>, unless you pass <code>claims_options</code></td><td>Always</td></tr>
          <tr><td>An <code>iat</code> in the future</td><td>Accepted (it only checks that <code>iat</code> is a number)</td><td>Refused, beyond the leeway</td><td>Accepted (it only checks that <code>iat</code> is there)</td></tr>
          <tr><td>Clock leeway</td><td>30 seconds</td><td>120 seconds</td><td>5 minutes</td></tr>
          <tr><td>UserInfo <code>sub</code> check</td><td><code>fetchUserInfo(config, token, expectedSub)</code></td><td>You compare it</td><td>Built in (<code>GetClaimsFromUserInfoEndpoint</code>)</td></tr>
          <tr><td>Plain HTTP for the local mock</td><td><code>allowInsecureRequests</code></td><td>No setting needed</td><td><code>RequireHttpsMetadata = false</code></td></tr>
          <tr><td>RP-initiated logout</td><td><code>buildEndSessionUrl</code></td><td><code>logout_redirect</code>, <code>validate_logout_response</code></td><td><code>SignOut</code> with the OpenIdConnect scheme</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The project turns on openid-client’s signature check on purpose: the lab has no TLS, and even with TLS, checking
          the signature costs one cached key lookup and catches a misconfigured proxy or a token that reached you another
          way. Take the setting out and the forged-signature and unknown-key tests fail: openid-client signs the user in
          with those tokens.
        </p>
      </div>

      <Step n={1}>A mock identity provider</Step>
      <div className="prose">
        <p>
          The tests must not call the internet, so each project contains a tiny OpenID provider, served by the same app
          under <code>/idp</code> (so its issuer is <code>http://localhost:3000/idp</code>, the same shape as Keycloak’s
          <code> /realms/…</code> issuers). It has the endpoints a real provider has:
        </p>
        <ul>
          <li><code>/.well-known/openid-configuration</code> and <code>/jwks</code>, with an RSA key made at start-up whose <code>kid</code> is its RFC 7638 thumbprint;</li>
          <li><code>/authorize</code>, which checks the client, the exact redirect URI, the <code>openid</code> scope and PKCE, then “signs in” the test user and redirects with a code;</li>
          <li><code>/token</code>, which authenticates the client with its secret, redeems the single-use code against the verifier, and returns an opaque access token and an RS256 ID token;</li>
          <li><code>/userinfo</code>, which returns the claims the granted scopes allow (<code>profile</code> gives <code>name</code>, <code>email</code> gives <code>email</code> and <code>email_verified</code>);</li>
          <li><code>/logout</code>, the <code>end_session_endpoint</code>, which checks the <code>id_token_hint</code> and redirects only to a registered <code>post_logout_redirect_uri</code>.</li>
        </ul>
        <p>
          It also has a test hook, <code>misbehave</code>, that makes it issue one kind of bad ID token: the wrong nonce,
          another audience (with <code>azp</code> naming your app), already expired, another issuer, signed with a key
          that is not in the JWKS, or a forgery that names the provider’s real <code>kid</code> but was signed with
          another key. The tests use it to prove the relying party notices each one.
        </p>
      </div>
      <StackFiles
        label="The mock identity provider"
        node={`${T}/node/src/mock-idp.ts`}
        python={`${T}/python/mock_idp.py`}
        dotnet={`${T}/dotnet/Api/MockIdp.cs`}
      />

      <Step n={2}>The relying party: configure, sign in, keep a session</Step>
      <div className="prose">
        <p>The app is configured with the issuer, its client id and secret, the scopes and its redirect URI. Then:</p>
        <ul>
          <li>
            <code>GET /login</code> makes a new state, nonce and PKCE verifier, stores them in the user’s session, and
            redirects to the provider with <code>scope=openid profile email</code>.
          </li>
          <li>
            <code>GET /callback</code> lets the library do the work: compare the state, redeem the code with the verifier
            and the client secret, validate the ID token, then call UserInfo with the access token for the name and email.
            On success the app starts a <strong>new</strong> session and redirects to <code>/me</code>. Node.js gives the
            session a new id (<code>req.session.regenerate</code>); Python clears the cookie session and writes a new one;
            .NET issues a new authentication cookie. Either way a session an attacker planted before sign-in (session
            fixation) is worthless. On any failure it answers
            <code> 401 {'{"error":"Sign-in failed."}'}</code> and keeps the real reason for the logs.
          </li>
          <li><code>GET /me</code> shows the signed-in user from the session; <code>GET /</code> says whether anyone is signed in.</li>
        </ul>
        <p>
          The session cookie is <code>HttpOnly</code> and <code>SameSite=Lax</code>. Lax matters: the browser must send the
          cookie on the top-level redirect back from the provider, or the callback cannot find the stored state and nonce.
          In .NET the handler keeps state and nonce itself, and the project asks for the code in the query string
          (<code>ResponseMode = Query</code>) instead of the default form POST, so its correlation and nonce cookies can be
          Lax too.
        </p>
      </div>
      <StackFiles
        label="The relying party"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={`${T}/python/app.py`}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="tip" label="Where the session lives">
        <p>
          express-session keeps the session on the server and only an id in the cookie (its default memory store is for
          development; use Redis or a database in production). Starlette’s <code>SessionMiddleware</code> keeps the whole
          session in a <em>signed</em> cookie: the user can read it but not change it, so keep it small. The server keeps
          nothing it could delete, so a copied cookie stays valid until it expires (14 days by default). ASP.NET Core’s
          cookie is encrypted with Data Protection; with <code>SaveTokens</code> it carries the tokens and grows, and a
          server-side <code>ITicketStore</code> keeps it small.
        </p>
      </Box>

      <h3>Signing out</h3>
      <div className="prose">
        <p>
          Deleting your own session is not enough: the user is still signed in at the provider, and the next
          <code> /login</code> goes straight through without a password. <strong>RP-initiated logout</strong> (OpenID
          Connect RP-Initiated Logout 1.0) fixes that. <code>POST /logout</code> (a POST, so another site cannot sign your
          users out with an image tag) ends the local session, then redirects to the provider’s
          <code> end_session_endpoint</code> with the <code>id_token_hint</code> (which user and client), a registered
          <code> post_logout_redirect_uri</code> and a <code>state</code>. The provider ends its own session and sends the
          browser back to <code>/logged-out</code>, which checks the state and redirects home.
        </p>
        <p>
          If the state at <code>/logged-out</code> does not match, Node.js and Python answer <code>400</code>; the .NET
          handler redirects only when it can decrypt its state, and otherwise answers an empty <code>200</code>. Either
          way the local session is already gone, and nothing redirects; the tests check both. Not every provider
          supports this: Google publishes no <code>end_session_endpoint</code>.
        </p>
      </div>

      <Step n={3}>Run the tests</Step>
      <div className="prose">
        <p>
          The tests play the browser with a cookie jar that does not follow redirects, so they can check every hop: the
          authorization request’s parameters, the callback, the session at <code>/me</code>. Then they break things: a
          forged state at sign-in, the six bad ID tokens, and a forged state at sign-out. Each bad token must give
          <code> 401 Sign-in failed.</code>, no session, and a logged reason that names the failed check. The provider tests
          check discovery, that the JWKS holds no
          private key parts, that UserInfo needs a valid access token, and that the provider never redirects to an
          unregistered address. The relying party’s back-channel calls (discovery, JWKS, token, UserInfo) reach the mock
          provider in the same app: over a free local port in Node.js, through an <code>httpx.ASGITransport</code> in
          Python, and through the in-memory test server’s handler in .NET.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/lab.ts`, `${T}/node/test/sign-in.test.ts`, `${T}/node/test/id-token.test.ts`, `${T}/node/test/idp.test.ts`]}
        python={[`${T}/python/harness.py`, `${T}/python/test_sign_in.py`, `${T}/python/test_id_token.py`, `${T}/python/test_idp.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/Lab.cs`, `${T}/dotnet/Api.Tests/SignInTests.cs`, `${T}/dotnet/Api.Tests/IdTokenTests.cs`, `${T}/dotnet/Api.Tests/IdpTests.cs`]}
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
          { tag: 'Python', text: '.............                   [100%]\n13 passed, 2 warnings' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 13, Skipped: 0, Total: 13' },
        ]}
      />
      <div className="prose">
        <p>
          The two Python warnings are Starlette’s and Authlib’s notices that they will move from <code>httpx</code> to
          <code> httpx2</code>; they come from the shared environment. The reasons each library logged for the bad
          sign-ins:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Bad sign-in</th><th>Node.js (openid-client)</th><th>Python (Authlib)</th><th>.NET (IdentityModel)</th></tr>
        </thead>
        <tbody>
          <tr><td>Forged state</td><td><code>unexpected "state" response parameter value</code></td><td><code>MismatchingStateError</code></td><td><code>Unable to unprotect the message.State.</code></td></tr>
          <tr><td>Wrong nonce</td><td><code>unexpected ID Token "nonce" claim value</code></td><td><code>InvalidClaimError: 'nonce'</code></td><td>IDX21323 (no nonce cookie matches the token’s nonce)</td></tr>
          <tr><td>Another audience</td><td><code>unexpected JWT "aud" (audience) claim value</code></td><td><code>InvalidClaimError: 'aud'</code></td><td>IDX10214: audience validation failed</td></tr>
          <tr><td>Expired</td><td><code>unexpected JWT "exp" (expiration time) claim value</code></td><td><code>ExpiredTokenError</code></td><td>IDX10223: lifetime validation failed</td></tr>
          <tr><td>Another issuer</td><td><code>unexpected JWT "iss" (issuer) claim value</code></td><td><code>InvalidClaimError: 'iss'</code></td><td>IDX10205: issuer validation failed</td></tr>
          <tr><td>Unknown <code>kid</code></td><td><code>no applicable keys found</code></td><td><code>InvalidKeyIdError: No key for kid</code></td><td>IDX10503: signature validation failed (kid not found)</td></tr>
          <tr><td>Forged signature</td><td><code>JWT signature verification failed</code></td><td><code>BadSignatureError</code></td><td>IDX10511: signature validation failed</td></tr>
        </tbody>
      </TableWrap>

      <h2>Try it with curl</h2>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>
          The issuer is built from the port, so on another port set <code>BASE_URL</code> (Node.js, Python) or
          <code> BaseUrl</code> (.NET), for example <code>BASE_URL=http://localhost:4100</code>. Here curl is the browser:
          a cookie jar keeps the session, and <code>-w '%{'{'}redirect_url{'}'}'</code> prints where each response
          redirects. Decoding the <code>id_token_hint</code> from the logout redirect shows the ID token your app received.
        </p>
      </div>
      <Output caption="Discovery, sign-in, the session, the ID token, sign-out (Node.js server)">{`
$ curl -s localhost:3000/idp/.well-known/openid-configuration | jq '{issuer, authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri, end_session_endpoint}'
{
  "issuer": "http://localhost:3000/idp",
  "authorization_endpoint": "http://localhost:3000/idp/authorize",
  "token_endpoint": "http://localhost:3000/idp/token",
  "userinfo_endpoint": "http://localhost:3000/idp/userinfo",
  "jwks_uri": "http://localhost:3000/idp/jwks",
  "end_session_endpoint": "http://localhost:3000/idp/logout"
}
$ curl -s localhost:3000/idp/jwks | jq '.keys[0] | {kty, kid, use, alg}'
{
  "kty": "RSA",
  "kid": "i37sMN_A1gXP6rDgwqDhpoPoO5Z-IXXeM4Ww5PC-R_Y",
  "use": "sig",
  "alg": "RS256"
}
$ curl -s localhost:3000/me
{"error":"Not signed in."}
$ AUTHORIZE=$(curl -s -c jar -b jar -o /dev/null -w '%{redirect_url}' localhost:3000/login); echo "$AUTHORIZE"
http://localhost:3000/idp/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&scope=openid+profile+email&state=NfNwsfsPS-70ugKkMmigBa02pZQkjIqTZqYfnY-wp-k&nonce=aP72A4Q6R_8R3LjdSVmXdxAiN8Nl5rCg9yoQq3C_-O8&code_challenge=JkujWIQ-O0lLbqEsCEh8l7TMDeC0xjdw4qnaSId9S_U&code_challenge_method=S256&client_id=web-app&response_type=code
$ CALLBACK=$(curl -s -o /dev/null -w "%{redirect_url}" "$AUTHORIZE"); echo "$CALLBACK"
http://localhost:3000/callback?code=COZ9ase41g9YUs-G7Z8oNmoKJOm_ui3MYIWAwcDg8AA&state=NfNwsfsPS-70ugKkMmigBa02pZQkjIqTZqYfnY-wp-k
$ curl -s -i -c jar -b jar "$CALLBACK" | grep -i -E '^(HTTP|location)'
HTTP/1.1 302 Found
Location: /me
$ curl -s -b jar localhost:3000/me
{"sub":"u-1001","name":"Ada Example","email":"ada@example.com"}
$ curl -s -b jar localhost:3000/
{"signedIn":true,"name":"Ada Example"}
$ END=$(curl -s -c jar -b jar -o /dev/null -w '%{redirect_url}' -X POST localhost:3000/logout); sed -E 's/(id_token_hint=[^.]{12})[^&]*/\\1.../' <<< "$END"
http://localhost:3000/idp/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogged-out&state=53hx3UO-vBM_Wsy_1guTz_95An7vzEYioSUuaOI-rRE&id_token_hint=eyJhbGciOiJS...&client_id=web-app
$ sed -E 's/.*id_token_hint=([^&]+).*/\\1/' <<< "$END" | jq -R 'split(".") | (.[0], .[1]) | gsub("-";"+") | gsub("_";"/") | @base64d | fromjson'
{
  "alg": "RS256",
  "kid": "i37sMN_A1gXP6rDgwqDhpoPoO5Z-IXXeM4Ww5PC-R_Y",
  "typ": "JWT"
}
{
  "iss": "http://localhost:3000/idp",
  "sub": "u-1001",
  "aud": "web-app",
  "exp": 1792297278,
  "iat": 1792296978,
  "auth_time": 1792296978,
  "nonce": "aP72A4Q6R_8R3LjdSVmXdxAiN8Nl5rCg9yoQq3C_-O8"
}
$ BACK=$(curl -s -o /dev/null -w "%{redirect_url}" "$END"); echo "$BACK"
http://localhost:3000/logged-out?state=53hx3UO-vBM_Wsy_1guTz_95An7vzEYioSUuaOI-rRE
$ curl -s -i -c jar -b jar "$BACK" | grep -i -E '^(HTTP|location)'
HTTP/1.1 302 Found
Location: /
$ curl -s -b jar localhost:3000/me
{"error":"Not signed in."}
`}</Output>
      <div className="prose">
        <p>
          Look at the two <code>nonce</code> values: the one in the authorization request and the one inside the ID token
          are the same, and the ID token’s <code>kid</code> is the key in the JWKS. Python and .NET give the same statuses
          and bodies. Their authorization requests differ in the details: Authlib makes shorter state and nonce values,
          and the .NET handler packs its state into an encrypted value and starts its nonce with a timestamp.
        </p>
      </div>
      <Output
        caption="The authorization request from each server"
        panes={[
          { tag: 'Node.js (openid-client)', text: 'http://localhost:3000/idp/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&scope=openid+profile+email&state=NfNwsfsPS-70ugKkMmigBa02pZQkjIqTZqYfnY-wp-k&nonce=aP72A4Q6R_8R3LjdSVmXdxAiN8Nl5rCg9yoQq3C_-O8&code_challenge=JkujWIQ-O0lLbqEsCEh8l7TMDeC0xjdw4qnaSId9S_U&code_challenge_method=S256&client_id=web-app&response_type=code' },
          { tag: 'Python (Authlib)', text: 'http://localhost:3000/idp/authorize?response_type=code&client_id=web-app&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&scope=openid+profile+email&state=Jj3evQlcBApEtEo9asnuiVQLhJ1RTH&nonce=p6pH3ggvR2nmeocFMuuR&code_challenge=RC3apZYkUs7obho7wRR5GjgdHGRJlPJgs3s-NvmR75U&code_challenge_method=S256' },
          { tag: '.NET (AddOpenIdConnect)', text: 'http://localhost:3000/idp/authorize?client_id=web-app&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&response_type=code&scope=openid%20profile%20email&code_challenge=KJhzJ5ag9HFw_yUyO5E1g5Jq47wXzURMpEPuwcm8qNY&code_challenge_method=S256&nonce=639278932235603590.M2M3ZTRjYTgtNTMyNS00MGIwLTllNDYtNGRlNDQ1YTRhOWI2YjM3NjlhYzEtMTU3MC00OGRkLTlmMjctMTdlNmU4YTliNDIy&state=CfDJ8ClV1qVAsg1PveFxvVXjYqaOHznZU2N3RE2kayugBCta02ovVP1yMaanNjD4cLY1KH12qkzI1LyugV2SXVoiORDzJbux55RcqcFCqqzLhO42aiyWQAMA1u5Uu9t2F_AHGp5zDEGbgn-5ltJtTXl_xuReEecDAwrogZfKe-vthgLxyg8lSLBWKeY9fKp8jyqCPHLUvUJSKrEU5aH-dYMHYtj6pBmd0aK2ZoiOdM20U2aMfedJwOCreu-_EdH-v-vNbD3KARAU3GytiRky_BFtPRJWRnNq6DEVcrohV6wT9Q-KkejMKXxXICdEyGKv64EoJSc7snpSL7dmOZ_93jdJC224iN1on1iHrfuPOuPhJ9uUBZNU_OyItvESv34m3m5F_w' },
        ]}
      />

      <h2>Real providers</h2>
      <div className="prose">
        <p>
          Moving from the mock to a real provider is configuration: the issuer, the client id and secret from the
          provider’s console, and the redirect URIs you register there. Use HTTPS everywhere, so the local-only settings
          (<code>allowInsecureRequests</code>, <code>RequireHttpsMetadata = false</code>) disappear. The examples below
          are configuration for your own environment; the tests never run them.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Provider</th><th>Issuer (authority)</th><th>Where to register the redirect URIs</th><th>Worth knowing</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Microsoft Entra ID</td>
            <td><code>https://login.microsoftonline.com/{'{tenant-id}'}/v2.0</code></td>
            <td>App registrations → your app → Authentication → Web: redirect URIs and the front-channel logout URL</td>
            <td>Use your tenant id for a single-tenant app. With <code>common</code> or <code>organizations</code>, <code>iss</code> holds each user’s tenant, so validate it per tenant. Key users on <code>oid</code> + <code>tid</code> (or <code>sub</code>), never on <code>email</code>. Add <code>offline_access</code> for a refresh token</td>
          </tr>
          <tr>
            <td>Google</td>
            <td><code>https://accounts.google.com</code></td>
            <td>Google Cloud console → APIs &amp; Services → Credentials → OAuth client ID (Web application) → Authorized redirect URIs</td>
            <td>No <code>end_session_endpoint</code>, so no RP-initiated logout. Check <code>email_verified</code>; <code>hd</code> names a Workspace domain. Refresh tokens need <code>access_type=offline</code></td>
          </tr>
          <tr>
            <td>Okta</td>
            <td><code>https://{'{your-okta-domain}'}/oauth2/default</code></td>
            <td>Applications → your app → Sign-in redirect URIs and Sign-out redirect URIs</td>
            <td>That is the default custom authorization server; the org server’s issuer is <code>https://{'{your-okta-domain}'}</code>. Use the one your APIs trust</td>
          </tr>
          <tr>
            <td>Keycloak</td>
            <td><code>https://{'{host}'}/realms/{'{realm}'}</code></td>
            <td>Clients → your client → Valid redirect URIs and Valid post logout redirect URIs</td>
            <td>Turn on Client authentication for a confidential client, and set the PKCE method to S256 in the client’s advanced settings. Since Keycloak 17 there is no <code>/auth</code> prefix</td>
          </tr>
        </tbody>
      </TableWrap>
      <ByStack
        label="Pointing the relying party at a real provider (configuration, not run by the tests)"
        node={
          <Code title="oidc-config.ts: configuration, not run by the tests">{`
import * as oidc from 'openid-client';

// OIDC_ISSUER is one of:
//   https://login.microsoftonline.com/<tenant-id>/v2.0     Microsoft Entra ID
//   https://accounts.google.com                            Google
//   https://<your-okta-domain>/oauth2/default              Okta
//   https://sso.example.com/realms/<realm>                 Keycloak
const config = await oidc.discovery(
  new URL(process.env.OIDC_ISSUER!),
  process.env.OIDC_CLIENT_ID!,
  process.env.OIDC_CLIENT_SECRET!, // from a vault or the platform's secret store
  undefined,
  { execute: [oidc.enableNonRepudiationChecks] }, // HTTPS: no allowInsecureRequests
);
const redirectUri = 'https://app.example.com/callback'; // registered at the provider, exactly
const scope = 'openid profile email';
`}</Code>
        }
        python={
          <Code title="oidc_config.py: configuration, not run by the tests" lang="python">{`
import os

from authlib.integrations.starlette_client import OAuth

ISSUER = os.environ["OIDC_ISSUER"]  # e.g. https://login.microsoftonline.com/<tenant-id>/v2.0
CLIENT_ID = os.environ["OIDC_CLIENT_ID"]

oauth = OAuth()
oauth.register(
    name="idp",
    client_id=CLIENT_ID,
    client_secret=os.environ["OIDC_CLIENT_SECRET"],  # from a vault or the platform's secret store
    server_metadata_url=f"{ISSUER}/.well-known/openid-configuration",
    client_kwargs={"scope": "openid profile email", "code_challenge_method": "S256"},
)
# In the callback, keep requiring iss and aud:
#   await oauth.idp.authorize_access_token(request, claims_options={
#       "iss": {"essential": True, "value": ISSUER}, "aud": {"essential": True, "value": CLIENT_ID}})
`}</Code>
        }
        dotnet={
          <Code title="Program.cs: configuration, not run by the tests" lang="csharp">{`
// appsettings.json: "Oidc": { "Authority": "https://login.microsoftonline.com/<tenant-id>/v2.0", "ClientId": "<client-id>" }
// The secret comes from user-secrets in development and Key Vault (or similar) in production.
builder.Services.AddAuthentication(o =>
    {
        o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        o.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie()
    .AddOpenIdConnect(o =>
    {
        o.Authority = builder.Configuration["Oidc:Authority"];   // Google: https://accounts.google.com
        o.ClientId = builder.Configuration["Oidc:ClientId"];      // Okta: https://<domain>/oauth2/default
        o.ClientSecret = builder.Configuration["Oidc:ClientSecret"]; // Keycloak: https://<host>/realms/<realm>
        o.ResponseType = OpenIdConnectResponseType.Code;
        o.Scope.Add("email");
        o.SaveTokens = true;
        o.MapInboundClaims = false;
        o.CallbackPath = "/callback"; // register https://app.example.com/callback at the provider
    });
// For Entra ID only, Microsoft.Identity.Web's AddMicrosoftIdentityWebApp wraps the same handler.
`}</Code>
        }
      />
      <Box kind="tip" label="Single-page apps: keep the tokens on a server">
        <p>
          A browser app can run this flow itself as a public client with PKCE, but then its tokens live in JavaScript,
          where any cross-site scripting bug can read them. The safer pattern is a <strong>backend for frontend</strong>
          (BFF): a small server does the OIDC sign-in exactly as in this chapter, keeps the tokens, and gives the browser
          only an <code>HttpOnly</code> session cookie (chapter 05). Calls to APIs go through the BFF, which adds the
          access token.
        </p>
      </Box>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Signing users in with an access token, or with “the token endpoint answered”</td><td>A token issued to another app for the same user signs the attacker in</td><td>Validate the ID token, addressed to your <code>client_id</code></td></tr>
          <tr><td>Skipping the nonce or the state</td><td>Login CSRF; replayed or injected ID tokens and codes</td><td>A fresh state and nonce per sign-in, kept in the session and compared</td></tr>
          <tr><td>Checking the signature but not <code>iss</code> or <code>aud</code></td><td>Tokens from another tenant, or for another app, are accepted</td><td>All the checks in the table, with your library’s options set</td></tr>
          <tr><td>Keying users on <code>email</code></td><td>Emails change, are reused, and at some providers are not verified</td><td>Key on (<code>iss</code>, <code>sub</code>); treat email as a profile field</td></tr>
          <tr><td>Hard-coding a provider’s key</td><td>Sign-in breaks for everyone at the next key rotation</td><td>Fetch the JWKS from discovery, cache it, refetch on an unknown <code>kid</code></td></tr>
          <tr><td>Sending the ID token to your APIs</td><td>It is addressed to the client, not to the API</td><td>APIs take access tokens</td></tr>
          <tr><td>Signing out only locally</td><td>The provider signs the user straight back in</td><td>RP-initiated logout, where the provider supports it</td></tr>
          <tr><td>Several providers sharing one redirect URI</td><td>Mix-up (RFC 9700 section 4.4): a code from one provider is sent to another’s token endpoint</td><td>A redirect URI per provider (in ASP.NET Core, a scheme and <code>CallbackPath</code> each), or the <code>iss</code> check of RFC 9207, which openid-client makes when the provider’s metadata says <code>authorization_response_iss_parameter_supported</code> (Authlib 1.9 ignores <code>iss</code>)</td></tr>
          <tr><td>Keeping the session from before sign-in</td><td>Session fixation: an attacker’s session id becomes a signed-in one</td><td>A new session id at sign-in</td></tr>
          <tr><td>HTTP or <code>RequireHttpsMetadata = false</code> in production</td><td>Anyone on the network can swap the discovery document or tokens</td><td>HTTPS, and local-only flags only for a local mock</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="The callback already checks state. Why check the nonce as well?">
        <p>
          They protect different things. <code>state</code> ties the <em>callback request</em> to this browser’s sign-in
          (against login CSRF). The <code>nonce</code> sits <em>inside the signed ID token</em> and ties the token itself
          to this sign-in. If an attacker injects a code from their own session, or replays an ID token captured
          elsewhere, the token carries a different nonce (or none) and is refused, even though the provider signed it.
        </p>
      </Checkpoint>
      <Checkpoint question="Sign-in suddenly fails for every user. The logs say “no applicable keys found” (or IDX10503). What happened, and what is the fix?">
        <p>
          The provider rotated its signing keys and your app does not know the new <code>kid</code>. The libraries in this
          chapter fetch the JWKS again when they meet an unknown <code>kid</code>, so the usual cause is a key copied into
          configuration, a JWKS cached forever by your own code, or a proxy that serves an old copy. Fetch the keys from
          the discovery document’s <code>jwks_uri</code> and let the library cache and refresh them.
        </p>
      </Checkpoint>
      <Checkpoint question="Which value should identify a user in your database: their email, their sub, or something else?">
        <p>
          The pair (<code>iss</code>, <code>sub</code>). <code>sub</code> is unique and never reassigned only within one
          issuer, so two providers (or two Entra tenants) can use the same <code>sub</code> for different people. Email
          addresses change, get reused, and are not always verified, so linking accounts by email has let attackers take
          over accounts.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then make the mock provider add a
                <code> roles</code> claim and protect a <code>GET /admin</code> route that needs the <code>admin</code> role.
              </>
            ),
            hint: <>Put the claim in the ID token (or UserInfo), copy it into the session at sign-in, and answer 403 when it is missing. Chapter 18 covers roles and policies.</>,
          },
          {
            task: <>Require a recent sign-in for a sensitive page: send <code>max_age=300</code> and check <code>auth_time</code>.</>,
            hint: <>openid-client checks <code>auth_time</code> when you pass <code>maxAge</code> in the grant checks. With Authlib, compare <code>auth_time</code> with the current time yourself after the callback. In .NET, <code>MaxAge</code> on the options sends the parameter; check <code>auth_time</code> in the <code>OnTokenValidated</code> event. Make the mock provider honor <code>prompt=login</code> too.</>,
          },
          {
            task: <>Point your app at a real provider by configuration only: Keycloak in a container, or a free Okta developer account. Keep the tests on the mock.</>,
            hint: <>Register <code>http://localhost:3000/callback</code> and <code>http://localhost:3000/logged-out</code>; most providers allow plain HTTP for localhost redirect URIs only. Read the issuer from an environment variable.</>,
          },
          {
            task: <>Add OpenID Connect Back-Channel Logout 1.0: the provider POSTs a signed logout token to your app, which ends that user’s sessions.</>,
            hint: <>The logout token is a JWT with <code>iss</code>, <code>aud</code>, <code>iat</code>, <code>exp</code>, <code>jti</code>, the <code>events</code> claim and a <code>sub</code> or <code>sid</code>, and must not contain a <code>nonce</code>. Validate it like an ID token, then delete every session for that user; you need a server-side session store to find them.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>OpenID Connect is OAuth 2.0 plus the ID token: a signed JWT, addressed to your app, that says who signed in. Access tokens are for APIs and prove nothing about sign-in.</li>
          <li>Configure one issuer URL; discovery gives the endpoints, and the JWKS gives the keys by <code>kid</code>, refreshed when keys rotate.</li>
          <li>Sign in with the code flow, PKCE, a state and a nonce; validate signature, <code>iss</code>, <code>aud</code>, <code>azp</code>, <code>exp</code>, <code>iat</code> and <code>nonce</code>, and check that UserInfo’s <code>sub</code> matches.</li>
          <li>Then start your own session with a new id, key users on (<code>iss</code>, <code>sub</code>), and sign out at the provider too with RP-initiated logout.</li>
          <li>Use the standard library for your stack and check its defaults: openid-client’s signature check and Authlib’s audience check need a setting.</li>
        </ul>
      </Recap>
    </>
  );
}
