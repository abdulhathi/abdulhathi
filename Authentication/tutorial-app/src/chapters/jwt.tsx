import { Code } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { jwtFlow } from '../diagrams/specs/jwt';

const T = '08-jwt';

export function Jwt() {
  return (
    <>
      <ChapterIntro
        time="3–4 hours in one stack"
        project={T}
        learn={[
          'What the three parts of a JWT hold, and why anyone can read the payload',
          'The registered claims (iss, sub, aud, exp, nbf, iat, jti) and what a verifier must check for each',
          'HS256 (one shared secret) against RS256 and ES256 (a private key signs, a public key verifies), and when each fits',
          'Issuing a short-lived access token at sign-in and protecting GET /me with Authorization: Bearer',
          'Strict validation: an algorithm allowlist, issuer, audience, expiry and not-before with a small clock skew, required claims',
          'Publishing a JWKS, choosing the key by kid, and rotating keys without signing anyone out',
        ]}
        tools={[
          { name: 'Node.js', what: 'jose (SignJWT, jwtVerify, generateKeyPair, createLocalJWKSet) and Express 5.' },
          { name: 'Python', what: 'PyJWT with the cryptography package, and FastAPI.' },
          { name: '.NET', what: 'Microsoft.AspNetCore.Authentication.JwtBearer with TokenValidationParameters, and JsonWebTokenHandler to issue tokens.' },
        ]}
      />

      <div className="prose">
        <p>
          With a session cookie (chapter 05) the server keeps a record of every signed-in user and looks it up on each
          request. A <strong>JSON Web Token</strong> (JWT, RFC 7519, said “jot”) turns that around: the server writes the
          facts about the user into a small JSON document, signs it, and hands it to the client. On the next request the
          client sends the token back, and any server holding the right key can check the signature and trust the facts
          without asking a database.
        </p>
        <p>
          That is why JWTs are everywhere in APIs: as OAuth 2.0 access tokens, as OpenID Connect ID tokens (chapter 12),
          and between services. It is also why they are easy to get wrong. A JWT verifier makes a security decision from
          data an attacker can edit, so every check you skip is a door left open.
        </p>
      </div>

      <h2>Three parts, and anyone can read the payload</h2>
      <div className="prose">
        <p>
          A JWT is three <strong>base64url</strong> strings joined by dots: <code>header.payload.signature</code>.
          Base64url is plain base64 with <code>-</code> and <code>_</code> in place of <code>+</code> and{' '}
          <code>/</code>, and no padding, so the token is safe in a URL or an HTTP header.
        </p>
        <ul>
          <li>
            The <strong>header</strong> says how the token was signed: <code>alg</code> (the algorithm, such as RS256),
            <code> typ</code> (JWT) and <code>kid</code> (the <strong>key ID</strong>: which of the issuer’s keys signed it).
          </li>
          <li>
            The <strong>payload</strong> holds the <strong>claims</strong>: statements about the user and the token, such as
            who it is for and when it expires.
          </li>
          <li>
            The <strong>signature</strong> covers the first two parts. Change one character of the header or payload and it
            no longer matches.
          </li>
        </ul>
        <p>
          This is a signed JWT (a JWS, RFC 7515). It is <em>not encrypted</em>. Decoding the payload needs no key at all,
          as this real token from the Node.js server shows:
        </p>
      </div>
      <Output caption="A token’s header and payload, decoded without any key (captured from the Node.js server)">{`
{"alg":"RS256","typ":"JWT","kid":"Lzot4Utu_5bUkuQ-drtWwTt-4uB-fjhOLVl22czJt-4"}
{"email":"ada@example.com","iss":"https://auth.example.com","sub":"u_1001","aud":"https://api.example.com","iat":1792297336,"nbf":1792297336,"exp":1792297936,"jti":"62322f7f-07b4-4725-90bf-02bc9edca6cd"}
`}</Output>
      <Box kind="warn" label="Never put secrets in the payload">
        <p>
          The payload travels in headers, lands in logs and browser storage, and can be read by anyone who sees the token.
          Put in only what the API needs to make decisions: an ID, perhaps an email or a role. Never a password, an API
          key, or personal data you would not print in a log. (JWE, RFC 7516, encrypts tokens, but you rarely need it.)
        </p>
      </Box>

      <h3>The registered claims</h3>
      <div className="prose">
        <p>
          RFC 7519 reserves seven short claim names. Times are <strong>NumericDate</strong> values: whole seconds since
          1 January 1970 UTC.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Claim</th><th>Means</th><th>What the verifier does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>iss</code> (issuer)</td><td>Who made and signed the token, as a URL</td><td>Requires an exact match with the issuer it trusts</td></tr>
          <tr><td><code>sub</code> (subject)</td><td>Who the token is about: a stable user ID</td><td>Uses it as the user’s identity. Make it an ID that is never reused, not an email that can change hands</td></tr>
          <tr><td><code>aud</code> (audience)</td><td>Which API the token is for</td><td>Requires its own identifier. Without this check, a token issued for another API works on yours</td></tr>
          <tr><td><code>exp</code> (expiration)</td><td>The moment the token stops being valid</td><td>Rejects it at or after that time, allowing a small clock skew</td></tr>
          <tr><td><code>nbf</code> (not before)</td><td>The moment the token starts being valid</td><td>Rejects it before that time, with the same skew</td></tr>
          <tr><td><code>iat</code> (issued at)</td><td>When the token was made</td><td>Useful for logs and a maximum age; PyJWT also rejects one from the future</td></tr>
          <tr><td><code>jti</code> (JWT ID)</td><td>A unique ID for this one token</td><td>Lets you log, trace or deny-list a single token (chapter 09)</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The <strong>clock skew</strong> (also called leeway) is a few seconds of tolerance, because the issuer’s and the
          API’s clocks never agree exactly. These projects allow 30 seconds. IdentityModel, the library behind ASP.NET Core’s JwtBearer, defaults to 5
          minutes, which quietly makes every 10-minute token a 15-minute token, so the .NET project sets it explicitly.
        </p>
      </div>

      <h2>HS256, or RS256 and ES256?</h2>
      <div className="prose">
        <p>
          The <code>alg</code> in the header names one of the algorithms from RFC 7518. Three matter in practice, and
          they fall into two families:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>HS256 (HMAC with SHA-256)</th><th>RS256 (RSA) and ES256 (elliptic curve P-256)</th></tr>
        </thead>
        <tbody>
          <tr><td>Keys</td><td>One shared secret, at least 256 random bits</td><td>A key pair: the private key signs, the public key verifies</td></tr>
          <tr><td>Who can verify</td><td>Only services holding the secret, and each of them could also <em>sign</em> tokens</td><td>Anyone with the public key, which can be published; only the issuer can sign</td></tr>
          <tr><td>Key distribution</td><td>Copy the secret to every verifier, and rotate it everywhere at once</td><td>Publish public keys as a JWKS; verifiers fetch them</td></tr>
          <tr><td>Size and speed</td><td>Tiny, fast signature (32 bytes)</td><td>RS256: 256-byte signature, slow to sign. ES256: 64 bytes, fast</td></tr>
          <tr><td>Fits</td><td>One service that issues and checks its own tokens</td><td>An identity provider, or any setup where other services verify tokens</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The projects issue <strong>RS256</strong> tokens, because it is what most identity providers (Microsoft Entra ID,
          Okta, Keycloak) use and every library supports it; ES256 would work the same way with smaller tokens. Each also
          has a small HS256 module so you can compare.
        </p>
      </div>

      <Diagram spec={jwtFlow} caption="The server signs with a private key and names it with kid. Verifiers find the matching public key in the JWKS, then check the claims." />

      <Step n={1}>A key ring, published as a JWKS</Step>
      <div className="prose">
        <p>
          A <strong>JSON Web Key</strong> (JWK, RFC 7517) is a key written as JSON. A <strong>JWK Set</strong> (JWKS) is a
          list of them, served at a well-known URL such as <code>/.well-known/jwks.json</code>. Verifiers download it and
          pick the key whose <code>kid</code> matches the token’s header.
        </p>
        <p>
          The key ring holds every key that may still have live tokens. The newest one signs; older ones only verify. Each
          key’s <code>kid</code> is its RFC 7638 <strong>thumbprint</strong>, a SHA-256 of its public parts, so two keys can
          never share an ID. The keys are generated when the server starts and live only in memory: nothing private is
          ever written to disk or committed.
        </p>
      </div>
      <StackFiles
        label="The key ring"
        node={`${T}/node/src/keys.ts`}
        python={`${T}/python/keys.py`}
        dotnet={`${T}/dotnet/Api/KeyRing.cs`}
      />
      <Box kind="tip" label="Where private keys live in production">
        <p>
          A key that is regenerated at every start signs everyone out at every deploy and differs between server
          instances. Real issuers keep the private key in a key vault or an HSM (Azure Key Vault, AWS KMS, Google Cloud
          KMS) and often sign through its API, so the key never leaves it. An identity provider does all of this for you.
        </p>
      </Box>

      <Step n={2}>Issue a token, and verify it strictly</Step>
      <div className="prose">
        <p>
          Issuing is the easy half: set the claims, put the <code>kid</code> in the header, sign with the current private
          key. The access token lives <strong>10 minutes</strong>. A stolen token is useful only until it expires, and a
          signed token cannot be recalled, so keep the lifetime short and use refresh tokens (chapter 09) to keep users
          signed in.
        </p>
        <p>Verifying is where the security is. Each project:</p>
        <ol>
          <li>reads <code>kid</code> from the header and finds that key in the ring; an unknown <code>kid</code> fails, with no fallback to “try every key”;</li>
          <li>accepts only the algorithms on its <strong>allowlist</strong> (RS256), never the one the token asks for;</li>
          <li>checks the signature;</li>
          <li>requires the exact issuer and audience;</li>
          <li>checks <code>exp</code> and <code>nbf</code> with 30 seconds of skew;</li>
          <li>requires every claim it relies on: <code>iss</code>, <code>sub</code>, <code>aud</code>, <code>exp</code>, <code>nbf</code>, <code>iat</code>, <code>jti</code>.</li>
        </ol>
        <p>
          The last check matters more than it looks. jose and PyJWT check <code>exp</code> only <em>if the token has
          one</em>: without <code>requiredClaims</code> (jose) or <code>{'options={"require": [...]}'}</code> (PyJWT), a
          correctly signed token with no <code>exp</code> is valid forever. IdentityModel requires <code>exp</code> by
          default (<code>RequireExpirationTime</code>).
        </p>
      </div>
      <StackFiles
        label="Issuing and verifying"
        node={`${T}/node/src/tokens.ts`}
        python={`${T}/python/tokens.py`}
        dotnet={`${T}/dotnet/Api/Tokens.cs`}
      />
      <ByStack
        label="How each library handles time and keys"
        node={
          <div className="prose">
            <p>
              <code>jwtVerify</code> takes a function that receives the protected header and returns the key, which is
              where the <code>kid</code> lookup happens. <code>requiredClaims</code> makes claims mandatory, and{' '}
              <code>currentDate</code> lets the tests pass in their fake clock.
            </p>
          </div>
        }
        python={
          <div className="prose">
            <p>
              PyJWT has no key-resolver hook, so <code>get_unverified_header</code> reads the <code>kid</code> first. That
              is safe because nothing from the header is trusted except as a lookup key; <code>algorithms</code> still
              decides what is allowed. PyJWT always compares <code>exp</code>, <code>nbf</code> and <code>iat</code>{' '}
              with the system clock, so its tests issue tokens in the past instead of moving a fake clock forward.
            </p>
          </div>
        }
        dotnet={
          <div className="prose">
            <p>
              <code>IssuerSigningKeyResolver</code> receives the <code>kid</code>. <code>TryAllIssuerSigningKeys</code>{' '}
              defaults to true: when no key matches the <code>kid</code>, IdentityModel then tries every key it was
              given (in <code>IssuerSigningKeys</code> or from the identity provider’s metadata), so this project sets it
              to false. IdentityModel enforces <code>exp</code>, <code>iss</code> and <code>aud</code> itself; the other
              required claims are checked by <code>Tokens.MissingClaim</code>, called from <code>Program.cs</code>. It
              compares times with the system clock (the <code>TimeProvider</code> property of{' '}
              <code>TokenValidationParameters</code> is internal in IdentityModel 8.19), so the tests issue tokens in the
              past.
            </p>
          </div>
        }
      />

      <Step n={3}>Sign in, protect GET /me, publish the keys</Step>
      <div className="prose">
        <p>
          <code>POST /login</code> answers like an OAuth 2.0 token endpoint (RFC 6749, section 5.1):{' '}
          <code>access_token</code>, <code>token_type: "Bearer"</code> and <code>expires_in</code> in seconds, with{' '}
          <code>Cache-Control: no-store</code> so no browser or proxy cache keeps a copy of the token. The
          client then sends <code>Authorization: Bearer &lt;token&gt;</code> on every call (RFC 6750). A missing token gets
          <code> 401</code> with <code>WWW-Authenticate: Bearer</code>; a token that fails any check gets{' '}
          <code>401</code> with <code>error="invalid_token"</code> and one generic message. The exact reason (expired,
          wrong audience, bad signature) belongs in your logs, not in the response.
        </p>
      </div>
      <StackFiles
        label="The endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`, `${T}/node/package.json`]}
        python={[`${T}/python/app.py`, `${T}/python/requirements.txt`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <div className="prose">
        <p>
          In .NET, the JwtBearer handler does the bearer parsing and validation; <code>RequireAuthorization()</code> on
          <code> /me</code> makes it mandatory. <code>MapInboundClaims = false</code> keeps claim names as they are in the
          token (otherwise <code>sub</code> becomes a long XML-schema URI), and the <code>OnChallenge</code> event writes the
          same JSON 401 as the other two stacks instead of an empty body.
        </p>
      </div>

      <Step n={4}>HS256, for one service on its own</Step>
      <div className="prose">
        <p>
          When the same service issues and checks its tokens, one shared secret is simpler than a key pair. The secret must
          be at least 256 random bits (RFC 7518, section 3.2), never a word or a phrase: an attacker who has one token can
          try guesses offline, as fast as their hardware allows. The verifier still pins the algorithm to HS256.
        </p>
      </div>
      <StackFiles
        label="HS256 with a shared secret"
        node={`${T}/node/src/shared-secret.ts`}
        python={`${T}/python/shared_secret.py`}
        dotnet={`${T}/dotnet/Api/SharedSecret.cs`}
      />

      <h2>Rotating keys without signing anyone out</h2>
      <div className="prose">
        <p>
          Keys should change regularly, and at once if one might have leaked. Because every token names its key, rotation is
          a matter of order:
        </p>
        <ol>
          <li>
            <strong>Publish the new key.</strong> Add it to the JWKS. Verifiers cache the JWKS (these servers send{' '}
            <code>Cache-Control: max-age=300</code>), and good libraries fetch it again when they meet an unknown{' '}
            <code>kid</code>. Publishing a little before you sign with the key avoids even that extra fetch.
          </li>
          <li><strong>Sign with it.</strong> New tokens carry the new <code>kid</code>. Old tokens still verify with the old key.</li>
          <li>
            <strong>Retire the old key</strong> once its last token has expired: one token lifetime, plus the clock
            skew, after the switch. After a leak, retire it at once and accept that its users must sign in again.
          </li>
        </ol>
        <p>The rotation test in each project walks through exactly these steps.</p>
      </div>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          Each project tests the same cases: a valid token reaches <code>/me</code>, and an expired token, a token for
          another audience or from another issuer, a token missing a required claim, a tampered payload,{' '}
          <code>alg: "none"</code>, an HS256 token signed with the public key, a token from an unknown key, and a token
          whose <code>jku</code> header points to the attacker’s own key set are all refused. Rotation keeps old tokens working until their key is retired, and a separate verifier can check tokens
          using only the published JWKS. The tests forge the bad tokens by hand, exactly as an attacker would.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/tokens.test.ts`, `${T}/node/test/app.test.ts`]}
        python={[`${T}/python/test_tokens.py`, `${T}/python/test_app.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/TokenTests.cs`, `${T}/dotnet/Api.Tests/JwtTests.cs`]}
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
          { tag: 'Python', text: '.................                                                        [100%]\n17 passed, 1 warning in 0.31s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    17, Skipped:     0, Total:    17, Duration: 2 s - Api.Tests.dll (net9.0)' },
        ]}
      />
      <div className="prose">
        <p>
          Every bad token gets the same 401, but each library knows why it refused. These are the reasons each one
          reported for the forged tokens in the tests, which is what you will see in your logs:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>The token</th><th>jose (Node.js)</th><th>PyJWT (Python)</th><th>IdentityModel (.NET)</th></tr>
        </thead>
        <tbody>
          <tr><td>Expired 40 seconds ago</td><td><code>ERR_JWT_EXPIRED</code></td><td><code>ExpiredSignatureError</code></td><td><code>SecurityTokenExpiredException</code> (IDX10223)</td></tr>
          <tr><td><code>nbf</code> 60 seconds ahead</td><td><code>ERR_JWT_CLAIM_VALIDATION_FAILED</code> (nbf)</td><td><code>ImmatureSignatureError</code></td><td><code>SecurityTokenNotYetValidException</code> (IDX10222)</td></tr>
          <tr><td>Another audience</td><td><code>ERR_JWT_CLAIM_VALIDATION_FAILED</code> (aud)</td><td><code>InvalidAudienceError</code></td><td><code>SecurityTokenInvalidAudienceException</code> (IDX10214)</td></tr>
          <tr><td>Another issuer</td><td><code>ERR_JWT_CLAIM_VALIDATION_FAILED</code> (iss)</td><td><code>InvalidIssuerError</code></td><td><code>SecurityTokenInvalidIssuerException</code> (IDX10205)</td></tr>
          <tr><td>No <code>exp</code></td><td><code>ERR_JWT_CLAIM_VALIDATION_FAILED</code> (missing exp)</td><td><code>MissingRequiredClaimError</code></td><td><code>SecurityTokenNoExpirationException</code> (IDX10225)</td></tr>
          <tr><td>No <code>sub</code></td><td><code>ERR_JWT_CLAIM_VALIDATION_FAILED</code> (missing sub)</td><td><code>MissingRequiredClaimError</code></td><td>Passes the handler; the <code>MissingClaim</code> check fails it</td></tr>
          <tr><td>Payload changed</td><td><code>ERR_JWS_SIGNATURE_VERIFICATION_FAILED</code></td><td><code>InvalidSignatureError</code></td><td><code>SecurityTokenInvalidSignatureException</code> (IDX10511)</td></tr>
          <tr><td><code>alg: "none"</code></td><td><code>ERR_JOSE_ALG_NOT_ALLOWED</code></td><td><code>InvalidAlgorithmError</code></td><td><code>SecurityTokenInvalidSignatureException</code> (IDX10504: no signature)</td></tr>
          <tr><td>HS256 signed with the public key</td><td><code>ERR_JOSE_ALG_NOT_ALLOWED</code></td><td><code>InvalidAlgorithmError</code></td><td><code>SecurityTokenInvalidSignatureException</code> (IDX10511)</td></tr>
          <tr><td>Signed by an unknown key</td><td>“Unknown signing key” (the resolver)</td><td>“Unknown signing key” (the lookup)</td><td><code>SecurityTokenSignatureKeyNotFoundException</code> (IDX10500)</td></tr>
          <tr><td>Our <code>kid</code> and a <code>jku</code>, signed by the attacker</td><td><code>ERR_JWS_SIGNATURE_VERIFICATION_FAILED</code></td><td><code>InvalidSignatureError</code></td><td><code>SecurityTokenInvalidSignatureException</code> (IDX10511)</td></tr>
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
          The session uses <code>jq</code> to shorten the token and to decode its parts. Run it against any of the three
          servers; only the token values, the order of the header fields and claims, and the case of header names
          (Python’s server prints them in lower case) differ.
        </p>
      </div>
      <Output caption="Sign in, read the token, call the API, tamper, fetch the keys (Node.js server)">{`
$ curl -s -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}' > login.json
$ jq -c '.access_token |= .[:24] + "..."' login.json
{"access_token":"eyJhbGciOiJSUzI1NiIsInR5...","token_type":"Bearer","expires_in":600}
$ curl -s -i -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}' | grep -i '^cache-control'
Cache-Control: no-store
$ TOKEN=$(jq -r .access_token login.json)
$ for part in 1 2; do cut -d. -f$part <<< "$TOKEN" | tr '_-' '/+' | jq -cR '@base64d | fromjson'; done
{"alg":"RS256","typ":"JWT","kid":"Lzot4Utu_5bUkuQ-drtWwTt-4uB-fjhOLVl22czJt-4"}
{"email":"ada@example.com","iss":"https://auth.example.com","sub":"u_1001","aud":"https://api.example.com","iat":1792297336,"nbf":1792297336,"exp":1792297936,"jti":"62322f7f-07b4-4725-90bf-02bc9edca6cd"}
$ curl -s localhost:3000/me -H "Authorization: Bearer $TOKEN"; echo
{"sub":"u_1001","email":"ada@example.com"}
$ curl -s -i localhost:3000/me | grep -iE '^(HTTP|www-auth)|error'
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer
{"error":"Missing bearer token."}
$ TAMPERED=$(cut -d. -f1 <<< "$TOKEN").$(echo -n '{"sub":"u_1002"}' | base64 | tr '+/' '-_' | tr -d '=').$(cut -d. -f3 <<< "$TOKEN")
$ curl -s -i localhost:3000/me -H "Authorization: Bearer $TAMPERED" | grep -iE '^(HTTP|www-auth)|error'
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"
{"error":"Invalid or expired token."}
$ curl -s localhost:3000/.well-known/jwks.json | jq -c '.keys[] | {kty, use, alg, kid, n: (.n[:16] + "..."), e}'
{"kty":"RSA","use":"sig","alg":"RS256","kid":"Lzot4Utu_5bUkuQ-drtWwTt-4uB-fjhOLVl22czJt-4","n":"kNAvzEjVY8ZD4Gft...","e":"AQAB"}
`}</Output>
      <Output
        caption="The decoded header and payload from each server"
        panes={[
          { tag: 'Node.js (jose)', text: '{"alg":"RS256","typ":"JWT","kid":"Lzot4Utu_5bUkuQ-drtWwTt-4uB-fjhOLVl22czJt-4"}\n{"email":"ada@example.com","iss":"https://auth.example.com","sub":"u_1001","aud":"https://api.example.com","iat":1792297336,"nbf":1792297336,"exp":1792297936,"jti":"62322f7f-07b4-4725-90bf-02bc9edca6cd"}' },
          { tag: 'Python (PyJWT)', text: '{"alg":"RS256","kid":"cCU9vdPWfbJUZtTNhCIwb_wN_nW97LW6sTZmg5pru7k","typ":"JWT"}\n{"iss":"https://auth.example.com","sub":"u_1001","aud":"https://api.example.com","email":"ada@example.com","iat":1792297336,"nbf":1792297336,"exp":1792297936,"jti":"bbc205b9-edbb-4b47-bd46-d99f5b465ee3"}' },
          { tag: '.NET (IdentityModel)', text: '{"alg":"RS256","kid":"W4Z6Lymyyih0blhyWJS24QqP6qB2EuvuwqCZJLjeJC0","typ":"JWT"}\n{"aud":"https://api.example.com","iss":"https://auth.example.com","exp":1792297936,"iat":1792297336,"nbf":1792297336,"sub":"u_1001","email":"ada@example.com","jti":"44c43149-9b36-4fb4-aeea-351a94f85bc0"}' },
        ]}
      />
      <div className="prose">
        <p>
          Notice that <code>exp - iat</code> is 600 seconds, and that <code>e</code> is <code>AQAB</code>: the RSA public
          exponent 65537, base64url-encoded. The JWKS shows only <code>n</code> and <code>e</code>, the public half.
        </p>
      </div>

      <h2>Verifying in another service</h2>
      <div className="prose">
        <p>
          The point of RS256 and a JWKS is that other APIs can verify your tokens without sharing a secret. In production
          they fetch the JWKS over HTTPS and cache it. The tests do the same with the key set they download from the test
          server; this is how you would point each library at a real issuer.
        </p>
      </div>
      <ByStack
        label="Configuration for an API that only verifies (not run by the tests)"
        node={
          <Code title="verify.ts: configuration, not run by the tests">{`
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Fetched on first use and cached; fetched again (at most every 30 s) when a token names an unknown kid.
const jwks = createRemoteJWKSet(new URL('https://auth.example.com/.well-known/jwks.json'));

export async function verify(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ['RS256'],
    issuer: 'https://auth.example.com',
    audience: 'https://api.example.com',
    requiredClaims: ['exp', 'sub'], // without this, a token with no exp never expires
    clockTolerance: 30,
  });
  return payload;
}
`}</Code>
        }
        python={
          <Code title="verify.py: configuration, not run by the tests" lang="python">{`
import jwt

# Caches the key set; fetches it again when a token names an unknown kid.
jwks_client = jwt.PyJWKClient("https://auth.example.com/.well-known/jwks.json")


def verify(token: str) -> dict:
    key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(token, key, algorithms=["RS256"], issuer="https://auth.example.com",
                      audience="https://api.example.com", leeway=30,
                      options={"require": ["exp", "sub"]})  # without this, a token with no exp never expires
`}</Code>
        }
        dotnet={
          <Code title="Program.cs: configuration, not run by the tests" lang="csharp">{`
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Reads https://auth.example.com/.well-known/openid-configuration, follows its jwks_uri, caches the keys,
        // and refreshes them when a token names an unknown kid. Identity providers serve both documents (chapter 12).
        options.Authority = "https://auth.example.com";
        options.Audience = "https://api.example.com";
        options.MapInboundClaims = false;
        options.TokenValidationParameters.ValidAlgorithms = [SecurityAlgorithms.RsaSha256];
        options.TokenValidationParameters.ClockSkew = TimeSpan.FromSeconds(30);
        options.TokenValidationParameters.TryAllIssuerSigningKeys = false; // a kid that matches no key fails, instead of trying them all
    });
`}</Code>
        }
      />

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Accepting <code>alg: "none"</code></td><td>An unsigned token with any claims the attacker likes passes</td><td>An explicit allowlist of algorithms; never trust the header’s <code>alg</code></td></tr>
          <tr><td>HS/RS algorithm confusion</td><td>A verifier that lets the token choose HS256 may use the <em>public</em> key as the HMAC secret, and anyone can sign with that</td><td>Pin the algorithm per key; keep HMAC and RSA keys apart</td></tr>
          <tr><td>Skipping <code>aud</code> (or <code>iss</code>)</td><td>A token your identity provider issued for another app, or a test environment, works on your API</td><td>Require the exact issuer and your own audience</td></tr>
          <tr><td>Long lifetimes (days, or no <code>exp</code>)</td><td>A stolen token works until it expires, and you cannot recall it</td><td>Minutes for access tokens, plus refresh tokens (chapter 09)</td></tr>
          <tr><td>Assuming the library requires <code>exp</code></td><td>jose and PyJWT check <code>exp</code> only when it is present, so a signed token without one never expires</td><td>List <code>exp</code>, and every other claim you rely on, as required</td></tr>
          <tr><td>Secrets or personal data in the payload</td><td>Anyone who sees the token can read it</td><td>IDs only; look everything else up on the server</td></tr>
          <tr><td>Keeping tokens in <code>localStorage</code></td><td>Any script injected into the page (XSS) can read and send them anywhere</td><td>Access token in memory; refresh token in an HttpOnly cookie, or a backend-for-frontend (chapter 09)</td></tr>
          <tr><td>Decoding instead of verifying</td><td><code>jwt.decode</code>-style helpers that skip the signature turn the token into a suggestion</td><td>Always call the verify function with keys and options</td></tr>
          <tr><td>Trying every key when <code>kid</code> is unknown</td><td>Hides misconfiguration and multiplies work for forged tokens</td><td>Choose by <code>kid</code>; refuse unknown ones (in .NET, <code>TryAllIssuerSigningKeys = false</code>)</td></tr>
          <tr><td>Fetching keys from the token’s <code>jku</code> or <code>x5u</code> header</td><td>The attacker chooses the URL, and so the key</td><td>Only use a JWKS URL you configured</td></tr>
          <tr><td>A weak HS256 secret</td><td>One captured token lets an attacker guess the secret offline</td><td>At least 256 random bits from a secure generator</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="Follow RFC 8725">
        <p>
          RFC 8725, JSON Web Token Best Current Practices, collects these lessons: verify the algorithm, validate every
          claim you rely on, use strong keys, and give tokens for different purposes different audiences or{' '}
          <code>typ</code> values so one cannot be swapped for another. RFC 9068 defines a standard JWT profile for OAuth
          access tokens, with the header <code>typ: "at+jwt"</code>, if you want your tokens to follow it.
        </p>
      </Box>

      <Checkpoint question="Your API checks the signature and exp, but not aud. Your company’s identity provider also issues tokens for an internal reporting tool. What can go wrong?">
        <p>
          A user (or attacker) who has a token for the reporting tool can send it to your API. It has a valid signature
          from the same issuer and has not expired, so your API accepts it, with whatever permissions the claims suggest.
          Requiring <code>aud</code> to equal your API’s identifier makes each token work only where it was meant to.
        </p>
      </Checkpoint>
      <Checkpoint question="Why must the server pick the algorithm from its own configuration, not from the token’s header?">
        <p>
          The header is written by whoever made the token, which may be an attacker. If the verifier follows it, the
          attacker can say <code>none</code> (no signature at all) or <code>HS256</code>, making a verifier that holds an
          RSA public key use that public, published key as an HMAC secret. An allowlist tied to the key (RS256 for an RSA
          key) closes both holes.
        </p>
      </Checkpoint>
      <Checkpoint question="You rotate to a new signing key and retire the old one in the same deploy. What happens to users?">
        <p>
          Every token signed with the old key fails at once, so everyone with a live token gets 401 until they refresh or
          sign in again, and verifiers that cached the old JWKS reject new tokens until they refetch. Publish the new key
          first (at least one JWKS cache time before you sign with it), then sign with it, and retire the old key only
          after one more token lifetime plus the clock skew.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then switch it from RS256 to{' '}
                <strong>ES256</strong>. Check that the JWKS now shows <code>kty: "EC"</code>, <code>crv</code>,{' '}
                <code>x</code> and <code>y</code>, and that the tokens are shorter.
              </>
            ),
            hint: <>jose: <code>generateKeyPair('ES256')</code>. Python: <code>ec.generate_private_key(ec.SECP256R1())</code> and <code>ECAlgorithm.to_jwk</code>. .NET: <code>ECDsa.Create(ECCurve.NamedCurves.nistP256)</code>, <code>ECDsaSecurityKey</code> and <code>SecurityAlgorithms.EcdsaSha256</code>. Keep the allowlist to the one algorithm.</>,
          },
          {
            task: <>Add a <code>scope</code> claim (for example <code>"profile:read"</code>) at sign-in, and make <code>GET /me</code> answer 403 when the token lacks it. Keep 401 for a bad token.</>,
            hint: <>401 means “who are you?”, 403 means “I know who you are, and no”. In .NET use an authorization policy with <code>RequireClaim("scope", "profile:read")</code>; chapter 18 goes further.</>,
          },
          {
            task: <>Add <code>GET /.well-known/openid-configuration</code> returning <code>issuer</code> and <code>jwks_uri</code>, then point a second small API at it (in .NET with <code>options.Authority</code>; in Node.js and Python by reading <code>jwks_uri</code>).</>,
            hint: <>For local HTTP in .NET set <code>options.RequireHttpsMetadata = false</code>, only in development. The <code>issuer</code> in the document must equal the <code>iss</code> in your tokens.</>,
          },
          {
            task: <>Set the header <code>typ</code> to <code>at+jwt</code> (RFC 9068) when issuing, and refuse tokens without it, so an ID token can never be used as an access token.</>,
            hint: <>jose: the <code>typ</code> option of <code>jwtVerify</code>. .NET: <code>TokenType</code> on the descriptor and <code>ValidTypes</code> on the parameters. PyJWT: check <code>get_unverified_header(token)["typ"]</code> yourself before decoding.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>A JWT is header.payload.signature in base64url. The payload is readable by anyone: no secrets in it.</li>
          <li>Verify with an algorithm allowlist, the exact issuer and audience, exp and nbf with a small skew, and the claims you rely on.</li>
          <li>HS256 suits one service that issues and checks its own tokens; RS256 or ES256 lets others verify with a published public key.</li>
          <li>Publish public keys as a JWKS, pick the key by kid, and rotate by publishing, switching, then retiring once the old key’s last token has expired.</li>
          <li>Keep access tokens short-lived and out of localStorage; chapter 09 adds refresh tokens and sign-out.</li>
        </ul>
      </Recap>
    </>
  );
}
