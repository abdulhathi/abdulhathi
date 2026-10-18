import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { passkeyCeremony } from '../diagrams/specs/passkeys';

const T = '15-passkeys';

export function Passkeys() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours in one stack"
        project={T}
        learn={[
          'How a passkey works: a key pair for one site, a private key that never leaves the device, and a signature instead of a shared secret',
          'Why passkeys resist phishing: the browser writes the origin, and the authenticator signs for one RP ID',
          'Synced and device-bound passkeys, and what user verification adds',
          'The registration and authentication ceremonies, and every check the server makes',
          'Testing WebAuthn without a browser, with a small software authenticator',
        ]}
        tools={[
          { name: 'Node.js', what: '@simplewebauthn/server and Express 5.' },
          { name: 'Python', what: 'webauthn (py_webauthn) and FastAPI.' },
          { name: '.NET', what: 'Fido2NetLib (the Fido2.AspNet package) in a minimal API.' },
        ]}
      />

      <div className="prose">
        <p>
          Passwords and one-time codes share one weakness: the user types a secret into a page. If the page is a
          convincing fake, the secret goes to the attacker, and a phishing proxy can pass a TOTP code along within its
          30 seconds. Passkeys remove the typing. The user unlocks their phone or laptop with a fingerprint, a face or a
          PIN, and the device proves it holds a private key by signing a challenge. Nothing the user can be tricked into
          typing exists.
        </p>
        <p>
          The standard behind passkeys is <strong>WebAuthn</strong> (W3C Web Authentication, Level 3), the browser API,
          together with FIDO2’s <strong>CTAP</strong> (Client to Authenticator Protocol), which the browser uses to talk
          to a phone or a security key. You write the server half: hand out challenges and check what comes back.
        </p>
      </div>

      <h2>What a passkey is</h2>
      <div className="prose">
        <p>A few terms first, because WebAuthn uses all of them:</p>
        <ul>
          <li>
            An <strong>authenticator</strong> makes and keeps the keys. A <em>platform</em> authenticator is built into
            the device (Touch ID or Face ID, Windows Hello, an Android phone’s screen lock). A <em>roaming</em> one is a
            separate security key over USB, NFC or Bluetooth. A phone can also act for a laptop by scanning a QR code
            (the <em>hybrid</em> transport).
          </li>
          <li>
            The <strong>relying party</strong> (RP) is your site, and the <strong>RP ID</strong> is its domain, for
            example <code>example.com</code>. Each key pair belongs to exactly one RP ID.
          </li>
          <li>
            A <strong>credential</strong> is one key pair for one account on one RP. Its <strong>credential ID</strong>
            names it. The server stores the ID and the <strong>public key</strong>; the private key stays inside the
            authenticator and is never sent anywhere.
          </li>
          <li>
            A <strong>passkey</strong> is a <em>discoverable</em> credential: the authenticator also stores the
            account’s <strong>user handle</strong> (your random user ID), so the user can sign in without typing a
            username. The browser simply offers the passkeys it holds for this RP ID.
          </li>
          <li>
            A <strong>ceremony</strong> is WebAuthn’s word for a flow. There are two: <em>registration</em> makes a new
            credential, <em>authentication</em> uses one to sign in.
          </li>
        </ul>
      </div>

      <TableWrap>
        <thead>
          <tr><th></th><th>Password</th><th>Password + TOTP</th><th>Passkey</th></tr>
        </thead>
        <tbody>
          <tr><td>What the server stores</td><td>A slow hash of a secret</td><td>A hash, plus a shared TOTP secret</td><td>A public key: nothing secret</td></tr>
          <tr><td>A look-alike phishing page</td><td>Gets the password</td><td>Gets both, and can relay the code at once</td><td>Gets nothing it can use</td></tr>
          <tr><td>A leaked database</td><td>Hashes to crack offline</td><td>The TOTP secrets, often unencrypted</td><td>Public keys, useless to an attacker</td></tr>
          <tr><td>Reuse across sites</td><td>Common</td><td>Common for the password</td><td>Impossible: one key pair per RP ID</td></tr>
          <tr><td>What the user does</td><td>Remembers and types</td><td>Types, then opens an app and types again</td><td>Touches a sensor or enters the device PIN</td></tr>
        </tbody>
      </TableWrap>

      <h2>Why passkeys stop phishing</h2>
      <div className="prose">
        <p>Three things work together, and none of them depends on the user noticing a fake address:</p>
        <ol>
          <li>
            <strong>The browser writes the origin.</strong> Every response carries <code>clientDataJSON</code>, a small
            JSON object with the ceremony type, the challenge and the <strong>origin</strong> (scheme, host and port) of
            the page that asked. The browser fills it in, not the page, so a page cannot claim to be another site.
          </li>
          <li>
            <strong>The authenticator signs for one RP ID.</strong> A page may only ask for an RP ID that is its own
            domain or a parent domain (never a public suffix such as <code>com</code>), so <code>examp1e.com</code> cannot
            ask for <code>example.com</code>’s passkeys, and the authenticator has none for <code>examp1e.com</code>. The data it signs,
            <code> authenticatorData</code>, starts with the SHA-256 hash of the RP ID.
          </li>
          <li>
            <strong>The signature covers both.</strong> The authenticator signs <code>authenticatorData</code> followed by
            the SHA-256 hash of <code>clientDataJSON</code>. The server checks the origin and the RP ID hash, then the
            signature. A response relayed from a fake site names the fake origin, and changing it breaks the signature.
          </li>
        </ol>
      </div>

      <h2>Synced or device-bound, and user verification</h2>
      <div className="prose">
        <p>
          A <strong>synced</strong> passkey (a <em>multi-device</em> credential) is copied, end-to-end encrypted, to the
          user’s other devices by a passkey provider: iCloud Keychain, Google Password Manager, or a password manager.
          Lose the phone and the passkey is still there. A <strong>device-bound</strong> passkey (a <em>single-device</em>
          credential) cannot leave its authenticator; a FIDO2 security key is the usual example. Two flag bits in
          <code> authenticatorData</code> tell them apart: <strong>BE</strong> (backup eligible) and <strong>BS</strong>
          (backed up now). The libraries turn them into a device type and a <code>backedUp</code> value, which these
          projects store. BS can change (a passkey may be backed up later), but BE is fixed for the life of a credential,
          so WebAuthn Level 3 asks a server that uses these flags to reject a sign-in whose BE differs from the stored
          value. The libraries leave that comparison to you, and these projects make it.
        </p>
        <p>
          Two other flags matter on every response. <strong>UP</strong> (user present) means someone touched or confirmed.
          <strong> UV</strong> (user verified) means the authenticator checked the user with a fingerprint, face or PIN,
          locally; the biometric never leaves the device. With UV a passkey is two factors in one: the device that holds
          the key, and the person who unlocks it. These projects ask for <code>userVerification: "required"</code> and,
          because a request is only a request, check the UV flag on the server too.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Synced passkey</th><th>Device-bound passkey</th></tr>
        </thead>
        <tbody>
          <tr><td>Flags</td><td>BE = 1 (and BS = 1 once backed up)</td><td>BE = 0, BS = 0</td></tr>
          <tr><td>Library’s device type</td><td><code>multiDevice</code></td><td><code>singleDevice</code></td></tr>
          <tr><td>Sign count</td><td>Usually always 0</td><td>Usually goes up with every use</td></tr>
          <tr><td>Losing the device</td><td>The passkey survives on the user’s other devices</td><td>The passkey is gone: register a backup key</td></tr>
          <tr><td>NIST SP 800-63B-4</td><td>Acceptable at AAL2</td><td>Required for AAL3 (a non-exportable key)</td></tr>
        </tbody>
      </TableWrap>

      <h2>The two ceremonies</h2>
      <div className="prose">
        <p>
          Registration and authentication have the same shape. The browser asks your server for <strong>options</strong>,
          which include a fresh random <strong>challenge</strong>. It passes them to the authenticator through
          <code> navigator.credentials.create()</code> (registration) or <code>navigator.credentials.get()</code>
          (authentication). Then it posts the result back for your server to <strong>verify</strong>.
        </p>
        <p>What comes back differs:</p>
        <ul>
          <li>
            <strong>Registration</strong> returns an <strong>attestation object</strong>, a CBOR map (CBOR is a compact
            binary JSON, RFC 8949) with three entries: <code>fmt</code>, <code>attStmt</code> and <code>authData</code>.
            The <code>authData</code> holds the new credential ID and its public key as a <strong>COSE key</strong> (a CBOR
            map of the key type, algorithm and coordinates). <strong>Attestation</strong> is the authenticator’s proof of
            its make and model; these projects ask for <code>"none"</code>, the right choice for most sites, because a
            consumer site gains nothing from it and synced passkeys do not provide it.
          </li>
          <li>
            <strong>Authentication</strong> returns <code>authenticatorData</code> (RP ID hash, flags, sign count), a
            <strong> signature</strong> over <code>authenticatorData</code> and the hash of <code>clientDataJSON</code>,
            and the user handle.
          </li>
        </ul>
      </div>

      <Diagram spec={passkeyCeremony} caption="Both ceremonies: get options with a single-use challenge, let the authenticator create or sign, then send the response back to be verified." />

      <TableWrap>
        <thead>
          <tr><th>What the server checks</th><th>Registration</th><th>Sign-in</th><th>What it stops</th></tr>
        </thead>
        <tbody>
          <tr><td>The challenge is one we issued, unused and under 5 minutes old</td><td>✓</td><td>✓</td><td>Replaying an old response</td></tr>
          <tr><td>The type is <code>webauthn.create</code> or <code>webauthn.get</code></td><td>✓</td><td>✓</td><td>Using one ceremony’s response in the other</td></tr>
          <tr><td>The origin is exactly ours</td><td>✓</td><td>✓</td><td>Phishing</td></tr>
          <tr><td>The RP ID hash is SHA-256 of our RP ID</td><td>✓</td><td>✓</td><td>A credential made for another site</td></tr>
          <tr><td>The UP and UV flags are set</td><td>✓</td><td>✓</td><td>Silent use; a found device without its owner</td></tr>
          <tr><td>The key algorithm is one we offered</td><td>✓</td><td></td><td>Weak or unexpected keys</td></tr>
          <tr><td>The credential ID is not registered already</td><td>✓</td><td></td><td>Overwriting another account’s credential (credential IDs are not secret)</td></tr>
          <tr><td>The user handle belongs to the credential’s owner</td><td></td><td>✓</td><td>Signing in to the wrong account</td></tr>
          <tr><td>The signature verifies with the stored public key</td><td></td><td>✓</td><td>Forgery: only the private key can make it</td></tr>
          <tr><td>The sign count went up (skipped only when the stored and the new count are both 0)</td><td></td><td>✓</td><td>A cloned authenticator</td></tr>
          <tr><td>The BE flag matches the one stored at registration</td><td></td><td>✓</td><td>A response that does not come from the kind of credential we registered</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The library does most of these checks; you supply the expected challenge, origin and RP ID, the stored public
          key and count, and you do the lookups (challenge, credential, owner) yourself. Each project has the same four
          routes: <code>POST /webauthn/register/options</code>, <code>POST /webauthn/register/verify</code>,
          <code> POST /webauthn/login/options</code> and <code>POST /webauthn/login/verify</code>, plus a demo page at
          <code> /</code>.
        </p>
      </div>

      <Step n={1}>What the server stores</Step>
      <div className="prose">
        <p>Three collections, kept in memory here; a real app uses database tables and Redis or a table with expiry:</p>
        <ul>
          <li>
            <strong>Users</strong>, each with a random 16-byte ID. That ID becomes the user handle stored on the
            authenticator, so it must not be the email or anything personal.
          </li>
          <li>
            <strong>Credentials</strong>: the credential ID, the owner, the COSE public key, the sign count, the
            <strong> transports</strong> the browser reported (<code>internal</code>, <code>hybrid</code>,
            <code> usb</code>, <code>nfc</code>, <code>ble</code>, used later to hint how to reach the authenticator), and
            the device type and backup state.
          </li>
          <li>
            <strong>Challenges</strong>: each one remembered with the ceremony it was issued for and an expiry five minutes
            later. <code>take</code> deletes the challenge <em>before</em> anything is verified, so a response can be
            checked at most once, even if it fails.
          </li>
        </ul>
        <p>
          The pending challenge is found by its own value, read from <code>clientDataJSON</code>, so this API needs no
          cookie. In a browser app with a session (chapter 05) you can keep the challenge in the session instead; the
          rules are the same: made by the server, single-use, short-lived. In .NET the whole options object is kept,
          because Fido2NetLib verifies against it.
        </p>
      </div>
      <StackFiles
        label="Users, credentials and challenges"
        node={`${T}/node/src/store.ts`}
        python={`${T}/python/store.py`}
        dotnet={`${T}/dotnet/Api/PasskeyStore.cs`}
      />

      <Step n={2}>The four endpoints</Step>
      <div className="prose">
        <p>
          <strong>Registration options.</strong> A new username gets a random user ID, and the library builds the options:
          the RP ID and name, the user, a 32-byte challenge, the algorithms we accept (<code>-8</code> EdDSA,
          <code> -7</code> ES256, <code>-257</code> RS256, as COSE numbers), <code>residentKey: "required"</code> (a
          discoverable credential, that is, a passkey), <code>userVerification: "required"</code> and attestation
          <code> "none"</code>. The user is saved only after verification succeeds. Registration here creates a new
          account; adding a passkey to an existing account must require that the user is already signed in, or anyone
          could attach their own passkey to your account.
        </p>
        <p>
          <strong>Registration verify.</strong> Read the challenge from <code>clientDataJSON</code>, take it from the
          store (400 if it is unknown, used or expired), let the library check the response, make sure the credential ID
          is new (400 if not), check the username is still free (409 if someone took it in the meantime), then save the
          user and the credential and answer <code>201</code>.
        </p>
        <p>
          <strong>Authentication options.</strong> No username: an empty list of allowed credentials tells the browser to
          offer every passkey it holds for this RP ID. The challenge is remembered for the authentication ceremony only.
        </p>
        <p>
          <strong>Authentication verify.</strong> Take the challenge, find the credential by ID, check the user handle
          belongs to its owner, and let the library check origin, RP ID hash, flags, signature and sign count. Then
          compare the BE flag with the stored device type, and save the new sign count and backup state. Every failure
          after the challenge check gets the same <code>401</code> and message, so a caller learns nothing about which
          check failed.
        </p>
      </div>
      <StackFiles
        label="The registration and authentication endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`, `${T}/node/package.json`]}
        python={[`${T}/python/app.py`, `${T}/python/requirements.txt`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <TableWrap>
        <thead>
          <tr><th>Where the libraries differ</th><th>@simplewebauthn/server</th><th>py_webauthn</th><th>Fido2NetLib</th></tr>
        </thead>
        <tbody>
          <tr><td>Requires the UV flag by default</td><td>Yes</td><td><strong>No</strong>: pass <code>require_user_verification=True</code></td><td>When the options asked for it</td></tr>
          <tr><td>What it needs from the options at verify time</td><td>The challenge</td><td>The challenge (bytes)</td><td>The whole original options object</td></tr>
          <tr><td>How a failed check is reported</td><td>Throws; a bad signature returns <code>verified: false</code></td><td>Raises <code>InvalidRegistrationResponse</code> or <code>InvalidAuthenticationResponse</code></td><td>Throws <code>Fido2VerificationException</code> with a <code>Code</code></td></tr>
          <tr><td>Uniqueness and owner checks</td><td>Yours</td><td>Yours</td><td>Callbacks you pass in (this project also checks the user handle itself first)</td></tr>
          <tr><td>BE compared with the stored value</td><td>Yours</td><td>Yours</td><td>Yours (version 4.3 has no parameter for it)</td></tr>
          <tr><td>Transports after registration</td><td>Returned</td><td>Read them from the request</td><td>Returned</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Choose the RP ID once">
        <p>
          Passkeys are bound to the RP ID forever. Moving from <code>app.example.com</code> to <code>example.com</code>
          later makes every existing passkey useless. Use the registrable domain (<code>example.com</code>) if you may
          add subdomains, and list every exact origin you serve from. Serving one service from several unrelated domains
          needs WebAuthn Level 3’s related origin requests (a <code>/.well-known/webauthn</code> file).
        </p>
      </Box>

      <Step n={3}>A demo page for a real browser</Step>
      <div className="prose">
        <p>
          The browser side is short. WebAuthn takes and returns binary values (<code>ArrayBuffer</code>s), while the
          server speaks JSON, so the page turns base64url strings into bytes before calling
          <code> navigator.credentials.create()</code> or <code>get()</code>, and turns the response back into base64url to
          post it. Each project serves the same page at <code>/</code>. Browsers allow WebAuthn on
          <code> http://localhost</code>; anywhere else it needs HTTPS.
        </p>
      </div>
      <StackFiles
        label="The demo page"
        node={`${T}/node/public/index.html`}
        python={`${T}/python/static/index.html`}
        dotnet={`${T}/dotnet/Api/wwwroot/index.html`}
      />
      <Box kind="tip" label="Newer browsers do the conversion for you">
        <p>
          <code>PublicKeyCredential.parseCreationOptionsFromJSON()</code>, <code>parseRequestOptionsFromJSON()</code> and
          <code> credential.toJSON()</code> do the base64url work in current browsers. The page converts by hand so it
          also runs in older ones, and so you can see exactly what crosses the wire.
        </p>
      </Box>

      <Step n={4}>A software authenticator for the tests</Step>
      <div className="prose">
        <p>
          Automated tests cannot touch a fingerprint sensor, so each project has a small software authenticator in its
          test code. Writing one is the best way to see what the server is really checking. It does five things:
        </p>
        <ol>
          <li>Makes an EC P-256 key pair and a random credential ID.</li>
          <li>
            Builds <code>clientDataJSON</code> as the browser would: type, challenge, origin, <code>crossOrigin</code>.
          </li>
          <li>
            Builds <code>authenticatorData</code>: the SHA-256 of the RP ID (32 bytes), the flags byte (UP, UV, and BE
            and BS for a synced passkey; AT when credential data follows), the sign count (4 bytes, big-endian) and, at
            registration, the attested credential data: a 16-byte AAGUID (zeros, “unknown model”), the credential ID’s
            length and the ID, and the public key as a COSE key.
          </li>
          <li>
            Wraps it for registration in a <code>"none"</code> attestation object, with a CBOR encoder of about fifteen
            lines that handles integers, byte strings, text and maps, which is all WebAuthn needs here.
          </li>
          <li>
            For sign-in, signs <code>authenticatorData</code> followed by the SHA-256 of <code>clientDataJSON</code> with
            ES256, in the DER format WebAuthn uses for ECDSA signatures.
          </li>
        </ol>
        <p>
          Each method takes an optional “tamper” argument (another origin or RP ID, a made-up challenge, a cleared UP or
          UV flag, backup flags that do not match the authenticator, a chosen sign count, another account’s user handle,
          another signing key), so each negative test changes exactly one thing from a response that otherwise succeeds.
        </p>
      </div>
      <StackFiles
        label="The software authenticator"
        node={`${T}/node/test/authenticator.ts`}
        python={`${T}/python/soft_authenticator.py`}
        dotnet={`${T}/dotnet/Api.Tests/SoftAuthenticator.cs`}
      />
      <Box kind="tip" label="End-to-end tests in a real browser">
        <p>
          For browser tests, Chrome has a virtual authenticator: in DevTools open More tools, then WebAuthn, and enable
          the virtual authenticator environment. Playwright and Selenium can create the same thing through the Chrome
          DevTools Protocol (<code>WebAuthn.addVirtualAuthenticator</code>), so a test can register and sign in without
          a person.
        </p>
      </Box>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          Each project runs the same seventeen tests: the options ask for a discoverable, user-verified passkey;
          registration then sign-in works and saves the key, transports and new sign count; a username registers once; a
          synced passkey reports its backup state and a sign count of 0 that stays 0; a credential ID registers once; and
          each of these fails: another origin, another RP ID, a challenge the server never issued, a challenge used
          twice, a challenge used for the other ceremony, a challenge older than five minutes, a sign count that does not
          go up (the same number again, or a drop to 0), a missing UP or UV flag, another account’s user handle, a
          device-bound passkey that suddenly reports backup flags, and a signature from another key. The last test fetches
          the demo page. To see that a test really guards its check, delete the check from the server and watch that test
          fail.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={`${T}/node/test/app.test.ts`}
        python={`${T}/python/test_app.py`}
        dotnet={`${T}/dotnet/Api.Tests/PasskeyTests.cs`}
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
          { tag: 'Python', text: '.................                                                        [100%]\n17 passed, 1 warning in 0.21s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    17, Skipped:     0, Total:    17, Duration: 1 s - Api.Tests.dll (net9.0)' },
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
          curl cannot make a passkey, but it can show the options a browser receives and how the server treats a response
          to a challenge it never issued (<code>e30</code> is <code>{'{}'}</code> in base64url: client data without any
          challenge). <code>{"-w ' %{http_code}\\n'"}</code> makes curl print the status code after the body.
        </p>
      </div>
      <Output caption="The session against the Node.js server (the challenge and user ID are random each time)">{`
$ curl -s -X POST localhost:3000/webauthn/register/options -H "Content-Type: application/json" -d '{"username":"ada@example.com"}' | python3 -m json.tool --indent 2
{
  "challenge": "dVG7oZxXOww8oZ-PPiBsB7jT2Nupqd9kJGv84zbP17k",
  "rp": {
    "name": "Auth Lab",
    "id": "localhost"
  },
  "user": {
    "id": "NHl6iIrhfbE6iBRzEp2OWQ",
    "name": "ada@example.com",
    "displayName": "ada@example.com"
  },
  "pubKeyCredParams": [
    {
      "alg": -8,
      "type": "public-key"
    },
    {
      "alg": -7,
      "type": "public-key"
    },
    {
      "alg": -257,
      "type": "public-key"
    }
  ],
  "timeout": 300000,
  "attestation": "none",
  "excludeCredentials": [],
  "authenticatorSelection": {
    "residentKey": "required",
    "userVerification": "required",
    "requireResidentKey": true
  },
  "extensions": {
    "credProps": true
  },
  "hints": []
}
$ curl -s -X POST localhost:3000/webauthn/login/options
{"rpId":"localhost","challenge":"dfdkxD-gHrJs4UkyJeEwfz5bMbt3pAneGSwNxTfLG6M","timeout":300000,"userVerification":"required"}
$ FAKE='{"id":"AAAA","rawId":"AAAA","type":"public-key","clientExtensionResults":{},"response":{"clientDataJSON":"e30","authenticatorData":"AAAA","signature":"AAAA"}}'
$ curl -s -X POST localhost:3000/webauthn/login/verify -H "Content-Type: application/json" -d "$FAKE" -w ' %{http_code}\\n'
{"error":"Unknown or expired challenge."} 400
$ curl -s -X POST localhost:3000/webauthn/register/options -H "Content-Type: application/json" -d '{"username":""}' -w ' %{http_code}\\n'
{"error":"Enter a username."} 400
`}</Output>
      <div className="prose">
        <p>
          The Python and .NET servers answer the last two requests identically and return the same option fields, in a
          different order, with a few harmless extras each library likes to add: SimpleWebAuthn adds
          <code> extensions.credProps</code> and <code>hints</code>; py_webauthn adds an empty
          <code> allowCredentials</code> to the sign-in options; Fido2NetLib adds <code>attestationFormats</code> and
          <code> hints</code> to the registration options, and an empty <code>allowCredentials</code> and
          <code> hints</code> to the sign-in options. One difference you may hit while experimenting: ASP.NET Core
          rejects a body that is missing fields Fido2NetLib marks as required (such as <code>signature</code>) with an
          empty <code>400</code> before the handler runs, where the other two answer with the JSON error.
        </p>
      </div>

      <h2>Try it in a browser</h2>
      <div className="prose">
        <p>
          With the server running, open <code>http://localhost:3000</code> (not <code>127.0.0.1</code>: the RP ID is
          <code> localhost</code>, and the origin must match). Click <strong>Create a passkey</strong> and unlock with
          your fingerprint, face, PIN or a security key; the page shows the server’s answer with the credential ID and
          whether the passkey is synced. Then click <strong>Sign in with a passkey</strong>: the browser lists the passkey
          you just made, and the server answers with your username. No device to hand? Use Chrome’s virtual
          authenticator from the tip in step 4. Restarting the server forgets every account (they live in memory), so
          delete the test passkey from your device or password manager afterwards.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>A challenge made in the browser, reused, or never expired</td><td>Old responses can be replayed</td><td>Random, made and stored by the server, single-use, a few minutes long</td></tr>
          <tr><td>Accepting any origin, or skipping the RP ID check</td><td>The phishing protection is gone</td><td>An exact list of your origins and one RP ID</td></tr>
          <tr><td>Asking for user verification but not checking the flag</td><td>A modified client can skip it</td><td>Require the UV flag on the server</td></tr>
          <tr><td>The email as the WebAuthn user ID</td><td>It is stored on the authenticator and returned on every sign-in</td><td>Random bytes, mapped to the account on the server</td></tr>
          <tr><td>Letting anyone register a passkey for an existing account</td><td>Account takeover in one request</td><td>Require a signed-in, recently re-authenticated user to add one</td></tr>
          <tr><td>Treating a sign count of 0 as an attack</td><td>Synced passkeys always send 0</td><td>Reject a count that did not go up, unless the stored and the new count are both 0</td></tr>
          <tr><td>Requiring attestation on a consumer site</td><td>Breaks synced passkeys, and reveals the device model</td><td><code>"none"</code>, unless an enterprise policy needs approved models</td></tr>
          <tr><td>A passkey as the only way in, with no recovery</td><td>A lost device locks the user out</td><td>Let users register several passkeys, and offer a careful recovery path</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="Account recovery decides your real security">
        <p>
          Passkeys make sign-in phishing-resistant, but an attacker will try the weakest door instead. If “forgot your
          passkey?” sends a link by email, your security equals email security. Encourage a second passkey (a synced one
          plus a security key, for example), and make recovery slow and well-logged, with a notice to the user.
        </p>
      </Box>
      <Box kind="tip" label="On .NET 10">
        <p>
          ASP.NET Core Identity in .NET 10 adds built-in passkey support. This project uses Fido2NetLib on .NET 9 so you see
          every step of both ceremonies; the checks are the same either way.
        </p>
      </Box>

      <Checkpoint question="A phishing site at examp1e.com relays your server’s sign-in options to a victim’s browser. Why can it not sign the victim in?">
        <p>
          The browser will not let a page on <code>examp1e.com</code> ask for the RP ID <code>example.com</code>, and the
          victim’s authenticator has no passkey for <code>examp1e.com</code>. Even with a credential from some other
          route, the browser writes <code>https://examp1e.com</code> into <code>clientDataJSON</code>, which the signature
          covers, and the server only accepts its own origin and the hash of its own RP ID.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does the server delete the challenge before it verifies the response, instead of after a success?">
        <p>
          So each challenge can be checked exactly once. A captured response, from a log or a proxy, cannot be replayed,
          and a failed attempt cannot be retried with small changes against the same challenge. The client simply asks
          for new options.
        </p>
      </Checkpoint>
      <Checkpoint question="A device-bound passkey signs in with sign count 12, but you stored 41. What does that suggest, and what should happen?">
        <p>
          Two authenticators may be using the same private key: a cloned or faulty authenticator. The libraries reject
          the sign-in. Flag the credential, tell the user, and ask them to register a new passkey. A synced passkey that
          always sends 0 is normal: when the stored and the new count are both 0, the check is skipped.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then add a passkey to an
                <em> existing</em> account: the options endpoint requires a signed-in user and lists their current
                credentials in <code>excludeCredentials</code>.
              </>
            ),
            hint: <>Use the session from chapter 05 to know who is signed in. With <code>excludeCredentials</code> filled in, a browser refuses to register the same authenticator twice (it throws <code>InvalidStateError</code>).</>,
          },
          {
            task: <>Support username-first sign-in: <code>login/options</code> accepts an optional username and returns that user’s credentials in <code>allowCredentials</code>, with their transports.</>,
            hint: <>Bind the stored challenge to the user, and at verify check the credential belongs to them. Answer an unknown username with the same shape as a known one, or you reveal which accounts exist.</>,
          },
          {
            task: <>Add passkey autofill (conditional UI) to the demo page: the username field offers passkeys as the user focuses it.</>,
            hint: <>Give the input <code>autocomplete="username webauthn"</code>, check <code>PublicKeyCredential.isConditionalMediationAvailable()</code>, then call <code>navigator.credentials.get({'{'} mediation: 'conditional', publicKey {'}'})</code> on page load.</>,
          },
          {
            task: <>List and delete a user’s passkeys (<code>GET</code> and <code>DELETE /webauthn/credentials</code>), showing the device type, backup state and last use.</>,
            hint: <>Check ownership on every delete (chapter 18). After a delete, the page can call <code>PublicKeyCredential.signalUnknownCredential()</code> so the passkey provider hides the dead passkey.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>A passkey is a discoverable WebAuthn credential: a key pair per RP ID, the private key on the authenticator, the public key on your server.</li>
          <li>It resists phishing because the browser writes the origin, the authenticator signs the RP ID hash, and the server checks both, plus the signature.</li>
          <li>Challenges are made by the server, random, single-use and short-lived; take them before verifying.</li>
          <li>Require and check user verification, store the sign count, transports and BE flag, and expect synced passkeys to report a count of 0.</li>
          <li>Registration for an existing account needs a signed-in user, and recovery needs as much care as sign-in.</li>
        </ul>
      </Recap>
    </>
  );
}
