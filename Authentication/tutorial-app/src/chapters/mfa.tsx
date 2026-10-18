import { Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { mfaSignIn } from '../diagrams/specs/mfa';

const T = '14-mfa';

export function Mfa() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours in one stack"
        project={T}
        learn={[
          'The three kinds of factor, and why a phishable code is still a big step up from a password alone',
          'How TOTP works (RFC 6238 on top of HOTP, RFC 4226), built from scratch and checked against the RFC test values and a library',
          'Enrolment: a 160-bit secret, the otpauth:// URI behind the QR code, and a first code before MFA is turned on',
          'Verifying with a ±1 step window, refusing replayed codes, and locking after repeated wrong codes',
          'Storing secrets encrypted with AES-GCM, and recovery codes hashed like passwords, each with its own salt',
          'The two-step sign-in: a pending token after the password, a session only after the code',
        ]}
        tools={[
          { name: 'Node.js', what: 'createHmac, AES-256-GCM and scrypt from node:crypto; Express 5; the otpauth package in the tests.' },
          { name: 'Python', what: 'hmac and struct from the standard library, cryptography (AESGCM), argon2-cffi, FastAPI; pyotp in the tests.' },
          { name: '.NET', what: 'HMACSHA1, AesGcm and Rfc2898DeriveBytes, Identity’s PasswordHasher, a minimal API; Otp.NET in the tests.' },
        ]}
      />

      <div className="prose">
        <p>
          Most account takeovers start with a password the attacker already has: reused from a site that leaked, guessed,
          or typed into a fake page. Chapter 04 made stored passwords hard to crack, but it cannot help when the attacker
          holds the real password. <strong>Multi-factor authentication</strong> (MFA) asks for a second, different kind
          of proof, so a password alone no longer opens the account.
        </p>
        <p>
          This chapter adds the most common second factor, the 6-digit code from an authenticator app, to the sign-in from
          chapter 04. You will build the code algorithm yourself, prove it matches the standard, store the shared secret
          safely, and give users a way back in when they lose their phone.
        </p>
      </div>

      <h2>Factors: something you know, have, or are</h2>
      <div className="prose">
        <p>
          A <strong>factor</strong> is one kind of evidence. The classic list has three kinds, and MFA means proof of at
          least two <em>different</em> kinds. A password and a security question are both things you know, so together
          they are still one factor.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Kind</th><th>Examples</th><th>What an attacker must do</th></tr>
        </thead>
        <tbody>
          <tr><td>Something you know</td><td>Password, PIN</td><td>Learn it: a leak, a guess, a fake page</td></tr>
          <tr><td>Something you have</td><td>Authenticator app on a phone, a passkey, a security key, a phone number for SMS</td><td>Get the device or the secret inside it, or trick you into handing over what it shows</td></tr>
          <tr><td>Something you are</td><td>Fingerprint, face</td><td>Fool the sensor on your device. The server never sees the fingerprint; it unlocks a “have” factor such as a passkey</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>Second factors differ a lot in how much they resist attack:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Second factor</th><th>Stops a leaked or guessed password</th><th>Stops a fake sign-in page</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td>SMS or voice code</td><td>Yes</td><td>No</td><td>SIM swaps and number porting hand the code to an attacker; NIST SP 800-63B calls it a “restricted” authenticator</td></tr>
          <tr><td>TOTP authenticator app (this chapter)</td><td>Yes</td><td>No</td><td>Free, works offline, no phone number needed</td></tr>
          <tr><td>Push approval in an app</td><td>Yes</td><td>No</td><td>“MFA fatigue”: attackers send prompts until one is accepted. Number matching helps</td></tr>
          <tr><td>Passkey or security key (chapter 15)</td><td>Yes</td><td>Yes</td><td>The browser signs for the real site’s domain only, so a look-alike domain gets nothing usable</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="TOTP codes can be phished">
        <p>
          A fake sign-in page can ask for the password, then for the code, and pass both to the real site within the same
          30 seconds. Phishing kits that sit in the middle like this are common, and they keep the session cookie the real
          site returns. TOTP does not stop that. It does stop the far more common attacks: a reused password from a
          leaked site, password spraying, and guessing. That is why it is still a large step up, and why the strongest
          choice for high-value accounts is a passkey (chapter 15).
        </p>
      </Box>

      <h2>How a TOTP code is made</h2>
      <div className="prose">
        <p>
          At enrolment, the server and the authenticator app agree on a random <strong>shared secret</strong>. After that
          they never talk again: both compute the same code from the secret and the current time, so the app works with
          no network.
        </p>
        <ol>
          <li>
            <strong>HOTP</strong> (RFC 4226, HMAC-based one-time password) turns a counter into a code: compute
            HMAC-SHA1 of the secret and the counter (as 8 bytes), giving 20 bytes. Then <strong>dynamic
            truncation</strong>: the low 4 bits of the last byte give an offset from 0 to 15; read 4 bytes there, clear the
            top bit, and keep the last 6 decimal digits.
          </li>
          <li>
            <strong>TOTP</strong> (RFC 6238, time-based) is HOTP with the counter set to the number of 30-second
            <strong> steps</strong> since 1970: <code>floor(unix time / 30)</code>. A new code every 30 seconds.
          </li>
        </ol>
        <p>
          A code has only six digits, so one random guess is right one time in a million, and a code is only valid for a
          few steps. The server’s job is to accept a code once, from a nearby step, and not let anyone try many codes.
        </p>
      </div>

      <Diagram spec={mfaSignIn} caption="With MFA on, the password earns only a pending token. A session comes after a valid code from the authenticator app, or a single-use recovery code." />

      <Step n={1}>TOTP from scratch, checked against the RFCs</Step>
      <div className="prose">
        <p>
          Each module has the same pieces: base32 (the encoding authenticator apps use for secrets), <code>hotp</code>,
          <code> totp</code>, a <code>verify</code> that accepts the step before, the current step and the step after,
          a new 160-bit secret (the length RFC 4226 recommends for HMAC-SHA1), and the <code>otpauth://</code> URI. Read
          <code> hotp</code> next to the description above: it is the whole algorithm.
        </p>
        <p>
          <code>verify</code> also takes the <strong>last used step</strong> and refuses any step at or before it. Without
          that, a code someone watched you type would work again for another minute or so. It checks all three steps every time
          and compares in constant time, so the response time says nothing about which step matched.
        </p>
      </div>
      <StackFiles
        label="HOTP, TOTP and base32"
        node={`${T}/node/src/totp.ts`}
        python={`${T}/python/totp.py`}
        dotnet={`${T}/dotnet/Api/Totp.cs`}
      />
      <div className="prose">
        <p>
          Code like this needs proof, not trust. The tests check <code>hotp</code> against the ten values in RFC 4226
          Appendix D and <code>totp</code> against the SHA-1 values in RFC 6238 Appendix B (8 digits there; the function
          takes the digit count), then compare 200 random secrets and times with a well-known library: otpauth in Node.js,
          pyotp in Python, Otp.NET in .NET. The library also reads back the URI. In production you may well use the library
          instead of your own code; now you know exactly what it does.
        </p>
      </div>
      <StackFiles
        label="The TOTP tests"
        node={`${T}/node/test/totp.test.ts`}
        python={`${T}/python/test_totp.py`}
        dotnet={`${T}/dotnet/Api.Tests/TotpTests.cs`}
      />
      <Box kind="key" label="Why a window of one step each way">
        <p>
          A phone’s clock can be a few seconds off, and a person needs time to read and type the code. Accepting the step
          before and after keeps each code valid for 30 seconds either side of its own step, about 90 seconds in all.
          RFC 6238 recommends allowing at most one step of delay. A wider window gives an attacker more valid codes to
          guess and a longer time to reuse a stolen one.
        </p>
      </Box>

      <Step n={2}>Store the secret encrypted, not in plain text</Step>
      <div className="prose">
        <p>
          A password is stored as a hash because the server only needs to check it. A TOTP secret is different: the server
          must use the secret itself to compute codes, so it cannot be hashed. If it sits in the database in plain text, a
          leaked backup gives the attacker every user’s second factor.
        </p>
        <p>
          So the secret is <strong>encrypted</strong> with AES-256-GCM. GCM is <strong>authenticated</strong> encryption:
          besides hiding the secret, it adds a 16-byte tag, and decryption fails if a single bit was changed. Three details:
        </p>
        <ul>
          <li>A fresh random 12-byte <strong>nonce</strong> for every value. Reusing a nonce with the same key breaks GCM.</li>
          <li>
            The user’s email goes in as <strong>associated data</strong>: not encrypted, but checked. Someone with write
            access to the table cannot copy their own secret onto another user’s row. (A real app binds the user’s ID,
            which never changes; with the email, changing it means sealing the secret again.)
          </li>
          <li>
            The <strong>key</strong> comes from configuration (in production, a key vault), never from the database. The
            stored value starts with <code>v1.</code> so a second key can be added later and old values re-encrypted.
          </li>
        </ul>
      </div>
      <StackFiles
        label="Encrypting secrets at rest"
        node={`${T}/node/src/secret-box.ts`}
        python={`${T}/python/secret_box.py`}
        dotnet={`${T}/dotnet/Api/SecretBox.cs`}
      />

      <Step n={3}>Recovery codes: shown once, stored hashed, used once</Step>
      <div className="prose">
        <p>
          Phones get lost, reset and replaced. Without a way back in, MFA turns into a support ticket. At enrolment the user
          gets ten <strong>recovery codes</strong> (NIST calls them look-up secrets) to keep somewhere safe. Each works
          once, in place of a TOTP code.
        </p>
        <p>
          Unlike the TOTP secret, the server only needs to check a recovery code, so it is hashed. Each code has 50 random
          bits. NIST SP 800-63B (revision 4, section 3.1.2.2; revision 3 said the same in 5.1.2.2) says a look-up secret
          shorter than 112 bits “SHALL be stored
          in a salted and hashed form using a suitable password hashing scheme”, with a salt of at least 32 bits “chosen
          to minimize salt value collisions among stored hashes”, and “both the salt value and the resulting hash SHALL
          be stored for each look-up secret.” So every code gets its <strong>own</strong> random 16-byte salt, and the
          projects reuse the slow hash from chapter 04 (scrypt in Node.js, Argon2id in Python, PBKDF2 in .NET).
        </p>
        <p>
          One salt shared by the whole set would be cheaper to check, but it breaks that rule: an attacker with the table
          could test each guess against all ten hashes for the price of one. The cost moves to the server instead:
          checking a typed code means hashing it once per unused code, stopping at the first match, so a wrong code costs
          up to ten slow hashes. That is acceptable here because only someone who has just passed the password check can
          reach this step, and the lock in step 4 allows five wrong codes per 15 minutes. Using a code deletes its entry.
        </p>
      </div>
      <StackFiles
        label="Recovery codes"
        node={[`${T}/node/src/recovery-codes.ts`, `${T}/node/src/passwords.ts`]}
        python={`${T}/python/recovery_codes.py`}
        dotnet={`${T}/dotnet/Api/RecoveryCodes.cs`}
      />
      <Box kind="tip" label="Make the codes easy to type">
        <p>
          The alphabet leaves out i, l, o and u, so nobody confuses 1 with l or 0 with o. The dash is for reading only:
          the check ignores case, spaces and dashes. Show the codes once, offer a download, and tell the user how many are
          left after each use (the sign-in response includes <code>recoveryCodesLeft</code>).
        </p>
      </Box>

      <Step n={4}>Enrolment and the two-step sign-in</Step>
      <div className="prose">
        <p>The endpoints, the same in all three projects:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Route</th><th>Needs</th><th>Does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>POST /signup</code></td><td>email, password</td><td>Creates a user (password hashed as in chapter 04)</td></tr>
          <tr><td><code>POST /login</code></td><td>email, password</td><td>Without MFA: <code>{'{"token": …}'}</code>. With MFA: <code>{'{"mfaRequired": true, "pendingToken": …}'}</code></td></tr>
          <tr><td><code>POST /login/mfa</code></td><td>pendingToken, code</td><td>A TOTP code or a recovery code; returns the session <code>token</code></td></tr>
          <tr><td><code>POST /mfa/setup</code></td><td>a session</td><td>Makes a secret; returns it as text and as an <code>otpauthUri</code></td></tr>
          <tr><td><code>POST /mfa/confirm</code></td><td>a session, code</td><td>A first valid code turns MFA on and returns 10 recovery codes</td></tr>
          <tr><td><code>GET /me</code></td><td>a session</td><td>Who you are, and whether MFA is on</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>The details that matter:</p>
        <ul>
          <li>
            <strong>The password earns only a pending token.</strong> It is random, lasts 5 minutes, works once, and
            nothing but <code>/login/mfa</code> accepts it. If <code>/login</code> issued a session and merely asked the
            front end to show a code screen, the second factor would be decoration.
          </li>
          <li>
            <strong>Enrolment is confirmed before it counts.</strong> <code>/mfa/setup</code> stores the new secret as
            pending. Only a valid code from the app moves it into place, so a mis-scanned QR code cannot lock the user out.
            The confirming code’s step is saved, so it cannot be used again to sign in.
          </li>
          <li>
            <strong>Five wrong codes lock code entry for 15 minutes</strong> (429 with <code>Retry-After</code>). At this
            point the attacker already has the password, and with three valid codes at any moment, unlimited tries would
            find one quickly. The count lives on the user, not the pending token, so signing in again does not reset it,
            and wrong recovery codes count too. Only someone who knows the password can trigger the lock. This lab starts
            the count again after each lock, which still allows about 480 guesses a day; NIST SP 800-63B (section 3.2.2)
            caps failures in a row at 100 per authenticator, after which it is disabled until the user sets it up again.
            OWASP also advises telling the user: a wrong code after a right password means someone else may know the
            password.
          </li>
          <li>
            <strong>Each check-then-update step runs as one.</strong> Two requests sent at the same moment must not both
            spend the same code or pending token, or both slip past the lock. Every project runs one request per user at a
            time: Python and .NET take a lock on the user (FastAPI runs these endpoints on a thread pool, ASP.NET Core on
            many threads), and Node.js chains each user’s requests on a promise, because checking a recovery code awaits
            slow hashes and other requests run in the meantime. In a database, use a transaction or a conditional
            <code> UPDATE … WHERE last_totp_step &lt; $1</code> and check that it changed a row.
          </li>
        </ul>
        <p>
          The <code>otpauthUri</code> is what the QR code contains:
          <code> otpauth://totp/Issuer:account?secret=…&amp;issuer=…&amp;algorithm=SHA1&amp;digits=6&amp;period=30</code>.
          The app shows the issuer and account above the code. The front end draws the QR code itself with a library;
          never send the URI to an online QR generator, because it contains the secret.
        </p>
      </div>
      <StackFiles
        label="The endpoints"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={[`${T}/python/app.py`, `${T}/python/requirements.txt`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Users.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          Besides the TOTP tests above, each project tests the encryption (a changed byte, another user’s email or another
          key all fail), the recovery codes, and the whole flow over HTTP with a fake clock, including attacks: a replayed
          code, a pending token used as a session or used twice, and the same code or many wrong codes sent at the same
          moment. The library in the tests plays
          the authenticator app, computing codes for whatever time the fake clock says, so the tests can step forward 30
          seconds or 15 minutes instantly.
        </p>
      </div>
      <StackFiles
        label="The other tests"
        node={[`${T}/node/test/storage.test.ts`, `${T}/node/test/app.test.ts`]}
        python={[`${T}/python/test_storage.py`, `${T}/python/test_app.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/StorageTests.cs`, `${T}/dotnet/Api.Tests/MfaTests.cs`]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 26\nℹ pass 26\nℹ fail 0' },
          { tag: 'Python', text: '..........................               [100%]\n26 passed, 1 warning' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 26, Skipped: 0, Total: 26' },
        ]}
      />
      <div className="prose">
        <p>
          The one Python warning comes from Starlette’s <code>TestClient</code>, which asks for a newer HTTP client
          package; it does not affect the tests.
        </p>
      </div>

      <h2>Try it with curl</h2>
      <div className="prose">
        <p>
          The encryption key comes from an environment variable. Make a random one for this run (without it, each server
          makes its own and prints a warning):
        </p>
      </div>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nMFA_ENCRYPTION_KEY=$(openssl rand -base64 32) npm start`}
        python={`cd snippets/${T}/python\nMFA_ENCRYPTION_KEY=$(openssl rand -base64 32) ../../.venv/bin/python -m uvicorn app:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\nMfa__EncryptionKey=$(openssl rand -base64 32) dotnet run --project Api --urls http://localhost:3000`}
      />
      <div className="prose">
        <p>
          You need codes for the secret that <code>/mfa/setup</code> returns. Add it to an authenticator app on your phone
          (most let you type the secret instead of scanning), or print the current code with pyotp from the lab’s Python
          environment:
        </p>
      </div>
      <Terminal title="Print the current code for a secret">{`snippets/.venv/bin/python -c "import pyotp, sys; print(pyotp.TOTP(sys.argv[1]).now())" <secret>`}</Terminal>
      <div className="prose">
        <p>
          The session below enrols, then signs in. The confirming code is refused a second time (replay), a recovery code
          works, and after 30 seconds a fresh code works. <code>jq</code>, a small JSON tool (install it if you do not have
          it), pulls one field out of a response.
        </p>
      </div>
      <Output caption="The same session against each server (all three answer identically; tokens and codes differ every run)">{`
$ curl -s -X POST localhost:3000/signup -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}'
{"email":"ada@example.com"}
$ TOKEN=$(curl -s -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}' | jq -r .token)
$ curl -s -X POST localhost:3000/mfa/setup -H "Authorization: Bearer $TOKEN"
{"secret":"O5EU3Y7E7ZUB52XMM7MMNNSG6VMXW7L6","otpauthUri":"otpauth://totp/Auth%20Lab:ada%40example.com?secret=O5EU3Y7E7ZUB52XMM7MMNNSG6VMXW7L6&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30"}
$ curl -s -X POST localhost:3000/mfa/confirm -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"code":"073085"}'
{"recoveryCodes":["gmty0-c16vy","vasxf-40dhk","v2kg7-6wvvb","n32sw-1dwab","mjs77-8gq90","7ew2c-0pksd","18476-b6t5y","dq6w5-wt437","n2aka-eczmj","w8fs5-55nv2"]}
$ curl -s -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}'
{"mfaRequired":true,"pendingToken":"ZSk8X9FFhIswrEZODaYZgns10dcdUO9iihv8VLYWMJ0"}
$ PENDING=$(curl -s -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}' | jq -r .pendingToken)
$ curl -s -X POST localhost:3000/login/mfa -H "Content-Type: application/json" -d '{"pendingToken":"'$PENDING'","code":"073085"}'
{"error":"That code is not valid."}
$ curl -s -X POST localhost:3000/login/mfa -H "Content-Type: application/json" -d '{"pendingToken":"'$PENDING'","code":"gmty0-c16vy"}'
{"token":"JLf1q16Hz3MaclhZ5Iwjip3YMix-ab2Lfsy6La5OAWk","recoveryCodesLeft":9}
# 30 seconds later, a new code:
$ PENDING=$(curl -s -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"email":"ada@example.com","password":"correct horse battery"}' | jq -r .pendingToken)
$ curl -s -X POST localhost:3000/login/mfa -H "Content-Type: application/json" -d '{"pendingToken":"'$PENDING'","code":"506283"}'
{"token":"i-SDxxUWAa5cYtIBVdFdW5D_I_c-alV1PjyQbfb5lo0"}
$ curl -s localhost:3000/me -H "Authorization: Bearer <the token above>"
{"email":"ada@example.com","mfa":true}
`}</Output>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>A session straight after the password, with the code checked “later”</td><td>The second factor can be skipped by calling the API directly</td><td>Only a pending token until the code passes</td></tr>
          <tr><td>Turning MFA on at set-up, before a first code</td><td>A mis-scanned QR code locks the user out</td><td>Keep the secret pending until a valid code confirms it</td></tr>
          <tr><td>TOTP secrets in plain text</td><td>One leaked backup holds every user’s second factor</td><td>Encrypt with a key kept outside the database (AES-GCM)</td></tr>
          <tr><td>Accepting a code twice</td><td>A code seen over a shoulder or in a phishing relay works again</td><td>Store the last used step and refuse it and older ones</td></tr>
          <tr><td>A wide window (±5 steps or more)</td><td>More valid codes to guess, and a longer life for a stolen one</td><td>±1 step</td></tr>
          <tr><td>Unlimited code attempts</td><td>Six digits fall to automated guessing</td><td>Lock or slow down after a few failures, per account, with a cap on failures in a row (NIST: at most 100)</td></tr>
          <tr><td>Checking a code and marking it used in separate steps</td><td>Two requests sent at the same moment both pass</td><td>Do both under one lock, or in one conditional <code>UPDATE</code></td></tr>
          <tr><td>Recovery codes stored as typed, or reusable</td><td>A leak or one glimpse gives a permanent bypass</td><td>Hash them like passwords, each with its own salt, and delete each on use</td></tr>
          <tr><td>Sending the otpauth URI to an online QR service</td><td>A third party gets the secret</td><td>Draw the QR code in your own front end</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="When MFA is reset">
        <p>
          Recovery is where attackers aim once MFA is on: a support desk that turns MFA off for a convincing caller undoes
          everything. Make resets slow and loud: require a recovery code or strong identity checks, email the user, and
          sign out every existing session.
        </p>
      </Box>

      <Checkpoint question="Why does POST /login return a pending token instead of a session when MFA is on?">
        <p>
          Because at that point only one factor has been proved. A session would let the client call every protected
          endpoint, and the code screen would be a suggestion the client could skip. The pending token is accepted only by
          <code> /login/mfa</code>, expires in 5 minutes and works once, so the only way to a session is through a valid
          second factor.
        </p>
      </Checkpoint>
      <Checkpoint question="A user confirms enrolment with code 073085 and, in the same 30 seconds, signs in with 073085. What happens, and why?">
        <p>
          The sign-in is refused with “That code is not valid.” Confirming saved that code’s step as the last used step,
          and <code>verify</code> refuses any step at or before it. The user waits for the next code. This is exactly what
          stops a code captured by a phishing relay or an onlooker from being used again.
        </p>
      </Checkpoint>
      <Checkpoint question="Why is the TOTP secret encrypted while the recovery codes are hashed?">
        <p>
          The server needs the TOTP secret itself to compute the expected codes, so it must be able to get it back: that
          calls for encryption with a key kept elsewhere. A recovery code only needs to be checked, like a password, so a
          one-way salted hash is enough and is safer: there is nothing to decrypt even with the key.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then add <code>POST /mfa/disable</code>,
                which needs a session and a current TOTP code, and clears the secret and recovery codes.
              </>
            ),
            hint: <>Reuse the same verify call and the same failure counter as <code>/login/mfa</code>, so disabling cannot be used to guess codes. Save the matched step, as everywhere else.</>,
          },
          {
            task: <>Add <code>POST /mfa/recovery-codes</code> to replace all ten codes, returning the new ones once.</>,
            hint: <>Require a fresh TOTP code, generate a new set (each code with a new salt), and replace the stored set, so every old code stops working at once.</>,
          },
          {
            task: <>Add “remember this browser for 30 days”: after a successful code, set a cookie that skips step 2 on the next sign-in from that browser.</>,
            hint: <>Make the cookie a random token, store only its SHA-256 hash with the user and an expiry, and delete them all when the password changes or MFA is reset.</>,
          },
          {
            task: <>Rotate the encryption key: accept <code>v1.</code> and <code>v2.</code> values, write only <code>v2.</code>, and re-encrypt each user’s secret at their next sign-in.</>,
            hint: <>Give <code>SecretBox</code> a map of key id to key and a current key id. <code>open</code> picks the key by the prefix; <code>seal</code> always uses the current one.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>MFA needs two different kinds of factor. TOTP stops leaked and guessed passwords, but not a real-time phishing relay; passkeys stop both.</li>
          <li>TOTP is HMAC-SHA1 of a shared 160-bit secret and the 30-second step, truncated to 6 digits (RFC 6238 over RFC 4226). Test it against the RFC values.</li>
          <li>Accept ±1 step, refuse any step at or before the last one used, and lock after a few wrong codes.</li>
          <li>Encrypt TOTP secrets with a key outside the database; hash each recovery code like a password, with its own salt, and delete it on use.</li>
          <li>Run each check-then-update as one step, so two requests at once cannot spend the same code.</li>
          <li>Confirm enrolment with a first code, and give only a pending token until the second factor passes.</li>
        </ul>
      </Recap>
    </>
  );
}
