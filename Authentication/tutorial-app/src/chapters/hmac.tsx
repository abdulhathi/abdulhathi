import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { webhookSignature } from '../diagrams/specs/hmac';

const T = '10-hmac';

export function Hmac() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours in one stack"
        project={T}
        learn={[
          'What an HMAC is, and how a signature proves who sent a request without the secret ever crossing the network',
          'Signing a webhook in the style of Stripe: HMAC-SHA256 over "<timestamp>.<body>", sent in a Webhook-Signature header',
          'Verifying the raw body bytes before parsing them, in constant time',
          'Stopping replays with a 5-minute window and a cache of recent deliveries',
          'Rotating the shared secret without missing a delivery, and where HTTP Message Signatures (RFC 9421) fit',
        ]}
        tools={[
          { name: 'Node.js', what: 'createHmac and timingSafeEqual from node:crypto; express.raw() for the exact body bytes.' },
          { name: 'Python', what: 'hmac and hashlib from the standard library; await request.body() in FastAPI.' },
          { name: '.NET', what: 'HMACSHA256.HashData and CryptographicOperations.FixedTimeEquals; reading HttpRequest.Body yourself.' },
        ]}
      />

      <div className="prose">
        <p>
          A <strong>webhook</strong> is an HTTP request another service sends to you when something happens: an order is
          paid, a build finishes, a repository receives a push. Your webhook endpoint has to be public so the sender can
          reach it, which means anyone on the internet can POST a fake “order paid” event to it too. Before you ship the
          goods, you need to know that the request really came from the payment provider and that nobody changed it on
          the way.
        </p>
        <p>
          The answer most providers use (Stripe, GitHub, Slack, Shopify and many more) is a signature. You and the sender
          share a secret. The sender computes an HMAC of the request body with that secret and puts it in a header. You
          compute the same HMAC over the body you received. If the two match, the request came from someone who holds the
          secret, and not one byte of it has changed.
        </p>
      </div>

      <h2>HMAC in plain words</h2>
      <div className="prose">
        <p>
          An <strong>HMAC</strong> (hash-based message authentication code, RFC 2104) is a hash with a key. HMAC-SHA256
          takes a key and a message and returns 32 bytes. Anyone with the key can compute the same 32 bytes for the same
          message; without the key, nobody can produce the right ones for a message of their choosing. Change one bit of
          the message and the result changes completely.
        </p>
        <p>
          Why not just hash the secret and the body together, <code>SHA-256(secret + body)</code>? Because SHA-256 has a
          property called <strong>length extension</strong>: from that hash, an attacker who does not know the secret can
          compute a valid hash for the same message with extra bytes added at the end. HMAC’s two-pass construction closes
          that hole. Always use the HMAC function from your crypto library.
        </p>
        <p>The difference from an API key (chapter 07) is what crosses the network:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>API key (chapter 07)</th><th>HMAC signature (this chapter)</th></tr>
        </thead>
        <tbody>
          <tr><td>What travels</td><td>The secret itself, in every request</td><td>Only a signature, valid for this body and this timestamp</td></tr>
          <tr><td>If someone records a request</td><td>They can use the key for any request until it is revoked</td><td>They can only resend that exact request, within 5 minutes; the replay cache stops even that</td></tr>
          <tr><td>Proves the body was not changed</td><td>No (only TLS protects it on the way)</td><td>Yes</td></tr>
          <tr><td>What the server stores</td><td>A hash of the key</td><td>The secret itself, because it must recompute the HMAC</td></tr>
          <tr><td>Typical use</td><td>Clients calling your API</td><td>Webhooks you receive; signed API requests</td></tr>
        </tbody>
      </TableWrap>

      <h2>What gets signed, and why the timestamp is inside</h2>
      <div className="prose">
        <p>
          If only the body were signed, a request recorded today would still verify next year. So the sender signs{' '}
          <code>&lt;timestamp&gt;.&lt;body&gt;</code> and sends the timestamp next to the signature:
        </p>
      </div>
      <Output caption="The header these projects use, in the style of Stripe’s">{`
Webhook-Signature: t=1792238400,v1=c0ed66f2141a653db1d8b65b667377f0673d6c075b3b5b95d4b08bf33b568407
`}</Output>
      <div className="prose">
        <p>
          <code>t</code> is the time of signing in Unix seconds and <code>v1</code> is the HMAC-SHA256 in hex (<code>v1</code>{' '}
          names the scheme, so a provider can introduce <code>v2</code> later). Because <code>t</code> is part of what was
          signed, an attacker cannot replace it with a fresh time: the signature would no longer match. The receiver can
          therefore trust <code>t</code> and refuse anything older than five minutes. Providers differ in the details:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Provider</th><th>Header</th><th>What is signed</th><th>Against replays</th></tr>
        </thead>
        <tbody>
          <tr><td>Stripe</td><td><code>Stripe-Signature: t=…,v1=…</code></td><td><code>&lt;t&gt;.&lt;body&gt;</code>, HMAC-SHA256, hex</td><td>A 5-minute tolerance in its libraries</td></tr>
          <tr><td>GitHub</td><td><code>X-Hub-Signature-256: sha256=…</code></td><td>The body only, HMAC-SHA256, hex</td><td>None in the signature: no timestamp, and the <code>X-GitHub-Delivery</code> id is not signed, so it only catches accidental duplicates</td></tr>
          <tr><td>Slack</td><td><code>X-Slack-Signature: v0=…</code> and <code>X-Slack-Request-Timestamp</code></td><td><code>v0:&lt;t&gt;:&lt;body&gt;</code>, HMAC-SHA256, hex</td><td>Reject requests older than 5 minutes</td></tr>
          <tr><td>Standard Webhooks</td><td><code>webhook-signature: v1,…</code> with <code>webhook-id</code> and <code>webhook-timestamp</code></td><td><code>&lt;id&gt;.&lt;t&gt;.&lt;body&gt;</code>, HMAC-SHA256, base64</td><td>A timestamp tolerance, and the signed id to deduplicate</td></tr>
          <tr><td>This lab</td><td><code>Webhook-Signature: t=…,v1=…</code></td><td><code>&lt;t&gt;.&lt;body&gt;</code>, HMAC-SHA256, hex</td><td>5 minutes, plus a cache of recent deliveries</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          HTTP header names are case-insensitive, so <code>Webhook-Signature</code> is the same header name that Standard
          Webhooks uses, but this lab puts Stripe’s value format in it. A Standard Webhooks library will not accept these
          webhooks, and this receiver will not accept theirs: pick one format per endpoint.
        </p>
      </div>

      <Diagram spec={webhookSignature} caption="The sender signs the timestamp and body with the shared secret. The receiver checks the time, recomputes the HMAC over the raw bytes, and rejects repeats before it parses anything." />

      <Step n={1}>The sender: sign exactly what you send</Step>
      <div className="prose">
        <p>
          The sender module has four small functions. <code>newSecret</code> makes a shared secret
          (<code>whsec_</code> plus 32 random bytes in base64url); the provider shows it once in a settings page and the
          receiver keeps it in a secret store. The whole string, prefix included, is the HMAC key, as with Stripe (Standard
          Webhooks instead base64-decodes the part after <code>whsec_</code>). <code>sign</code> computes the HMAC.{' '}
          <code>signatureHeader</code> builds the header, with one <code>v1</code> per active secret (that is what makes
          rotation smooth, in step 4). <code>deliver</code> sends a webhook, and its order matters: serialize the event to bytes <strong>once</strong>, sign those bytes, and send
          those same bytes. If you signed one serialization and let the HTTP client serialize again, the bytes could differ.
        </p>
        <p>
          The tests check <code>sign</code> against a fixed value, the same in all three stacks and the same that{' '}
          <code>openssl</code> prints, so a sender in one language and a receiver in another agree.
        </p>
      </div>
      <StackFiles
        label="Signing a webhook"
        node={`${T}/node/src/sender.ts`}
        python={`${T}/python/sender.py`}
        dotnet={`${T}/dotnet/Api/WebhookSender.cs`}
      />

      <Step n={2}>The receiver: verify before you parse</Step>
      <div className="prose">
        <p>
          <code>verify(header, body)</code> returns nothing for a genuine, new webhook, or the reason to reject it. It checks,
          cheapest first:
        </p>
        <ol>
          <li>
            <strong>The header is there and well formed</strong>: a <code>t</code> of 1 to 12 digits and at least one{' '}
            <code>v1</code> of 64 lowercase hex characters. Elements it does not know, such as a <code>v0</code>, are
            ignored, so a header that carries only an unknown scheme is malformed rather than accepted.
          </li>
          <li>
            <strong>The timestamp is within 5 minutes</strong> of the receiver’s clock, in either direction (a sender’s clock
            can run a little fast). Keep your servers’ clocks synchronized with NTP.
          </li>
          <li>
            <strong>Some <code>v1</code> matches the HMAC of <code>&lt;t&gt;.&lt;body&gt;</code></strong> under some active
            secret. Each comparison is constant-time, so the time taken does not reveal how many bytes of a forged signature
            were right.
          </li>
          <li>
            <strong>This delivery has not been seen before.</strong> A genuine request could be recorded and resent within
            the 5 minutes. The receiver keeps a SHA-256 digest of every accepted <code>&lt;t&gt;.&lt;body&gt;</code> until{' '}
            <code>t</code> plus 5 minutes, and answers <code>409</code> to a repeat. After that the timestamp check
            rejects the request anyway, so the entry can go. The cache is keyed on what was signed, not on the header
            text, because the header can change while the signature stays valid: a space after a comma, the{' '}
            <code>v1</code> repeated, an extra <code>v0</code>, or, during rotation, one of two <code>v1</code> values
            removed.
          </li>
        </ol>
        <p>
          The cache here lives in one process’s memory, so it is empty after a restart and not shared between instances.
          With more than one instance, keep it in a shared store such as Redis (<code>SET &lt;digest&gt; 1 NX EX 600</code>{' '}
          stores the key only if it is new, and expires it). Some receivers answer a repeat with <code>200</code> instead
          of <code>409</code>, so that a sender that resends an identical request stops retrying; this lab uses{' '}
          <code>409</code> so you can see the check work.
        </p>
      </div>
      <StackFiles
        label="Verifying a webhook"
        node={`${T}/node/src/receiver.ts`}
        python={`${T}/python/receiver.py`}
        dotnet={`${T}/dotnet/Api/WebhookVerifier.cs`}
      />
      <Box kind="warn" label="Parsing and re-serializing gives different bytes">
        <p>
          A common bug: the framework parses the JSON, and the code verifies <code>JSON.stringify(req.body)</code>. Parsing
          and serializing again can reorder keys, drop or add whitespace, turn <code>é</code> into <code>\u00e9</code>, and
          turn <code>1.0</code> into <code>1</code>. The signature was made over the original bytes, so a genuine webhook
          fails, and the usual “fix” is to turn verification off. One of the tests sends the same data pretty-printed to show
          it fails.
        </p>
      </Box>

      <Step n={3}>The endpoint: get the raw body</Step>
      <div className="prose">
        <p>
          <code>POST /webhooks/orders</code> reads the body as bytes, verifies, and only then parses JSON. A body that
          verifies but is not a JSON object gets <code>400</code>; a good one gets <code>200</code> with{' '}
          <code>{'{"received":true,"type":…}'}</code>. Getting at the raw bytes is the part that differs per framework:
        </p>
      </div>
      <ByStack
        label="Reading the raw body in each framework"
        node={
          <div className="prose">
            <p>
              <code>express.json()</code> reads and parses the body stream, and afterwards the original bytes are gone. So
              there is no global <code>app.use(express.json())</code> in front of this route; the route has its own{' '}
              <code>express.raw(&#123; type: () =&gt; true &#125;)</code>, which leaves <code>req.body</code> as a{' '}
              <code>Buffer</code> (up to 100 kB by default; larger bodies get <code>413</code>). The function form
              matters: with <code>type: '*/*'</code>, a request without a <code>Content-Type</code> header is not read
              at all, and a genuine webhook fails as “Signature does not match.” If other routes need JSON, mount{' '}
              <code>express.json()</code> after this route, or use its <code>verify(req, res, buf)</code> option to keep a
              copy of the bytes.
            </p>
          </div>
        }
        python={
          <div className="prose">
            <p>
              A Pydantic model parameter would make FastAPI parse the JSON before your code runs. Instead the endpoint takes
              the <code>Request</code> and calls <code>await request.body()</code>, which returns the bytes as received.
              Starlette keeps them, so <code>await request.json()</code> would still work afterwards; here{' '}
              <code>json.loads</code> parses the same bytes once they are verified, with{' '}
              <code>parse_constant</code> set so that <code>NaN</code> and <code>Infinity</code> (which are not JSON, but
              which <code>json.loads</code> accepts by default) are refused as in the other stacks. Starlette sets no limit
              on body size, so in production cap it in the reverse proxy in front.
            </p>
          </div>
        }
        dotnet={
          <div className="prose">
            <p>
              A typed parameter such as <code>(WebhookEvent evt)</code> makes ASP.NET Core read and deserialize the body
              before your code runs. Instead the endpoint takes <code>HttpRequest</code> and copies{' '}
              <code>request.Body</code> into a byte array, then, after verifying, deserializes it into a{' '}
              <code>JsonElement</code> (Kestrel’s default limit is about 30 MB). When a middleware has to read the body
              before the endpoint does, it calls <code>request.EnableBuffering()</code> first and sets <code>request.Body.Position = 0</code> afterwards, so
              the body can be read again.
            </p>
          </div>
        }
      />
      <StackFiles
        label="The receiving endpoint"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={[`${T}/python/app.py`, `${T}/python/server.py`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="tip" label="Answer fast, then do the work">
        <p>
          Senders wait only a few seconds (GitHub allows 10) and treat a timeout or any non-2xx status as a failure. Many
          then retry with growing delays, Stripe for up to three days. Verify, put the event on a queue, answer{' '}
          <code>200</code>, and process it afterwards. Retries mean the same event can arrive more than once, re-signed with
          a new timestamp, so the replay cache does not catch it: make the handler idempotent by recording the event{' '}
          <code>id</code> and skipping ids you have already processed.
        </p>
      </Box>

      <Step n={4}>Rotate the secret without missing a delivery</Step>
      <div className="prose">
        <p>
          Secrets leak (a log line, a laptop, a former colleague), so plan rotation from the start. The receiver accepts a
          list of active secrets, read from <code>WEBHOOK_SECRETS</code> as a comma-separated list, newest first. The steps:
        </p>
        <ol>
          <li>Create the new secret and add it to the receiver: <code>WEBHOOK_SECRETS=whsec_new,whsec_old</code>. Both now verify.</li>
          <li>Switch the sender to the new secret. During the switch it can sign with both and send two <code>v1</code> values (Stripe does this while an old secret is still active).</li>
          <li>Once no deliveries signed only with the old secret arrive, remove it from the receiver.</li>
        </ol>
        <p>
          The rotation test covers this: a receiver with two secrets accepts a webhook signed with either one, refuses a
          third, and still catches a replay whose header has one of its two <code>v1</code> values removed. If a secret has
          leaked, shorten the overlap to minutes.
        </p>
      </div>

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          Each project runs the same fourteen tests: the fixed HMAC value and the header with one <code>v1</code> per
          secret, then, against the real endpoint, a good webhook and one sent by <code>deliver()</code>, and every attack
          from this chapter: a tampered body, the wrong secret, pretty-printed JSON, timestamps 301 seconds early and late
          (and exactly 300, which passes), an old signature with <code>t</code> moved to now, a replay with its header
          rewritten, a replay after the window has closed, missing and malformed headers (no <code>t</code>, a short{' '}
          <code>v1</code>, only a <code>v0</code>, a 5000-digit <code>t</code>), bodies that are not JSON, rotation, and a
          request with no <code>Content-Type</code>.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/sender.test.ts`, `${T}/node/test/receiver.test.ts`]}
        python={[`${T}/python/test_sender.py`, `${T}/python/test_receiver.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/SenderTests.cs`, `${T}/dotnet/Api.Tests/ReceiverTests.cs`]}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 14\nℹ pass 14\nℹ fail 0' },
          { tag: 'Python', text: '..............           [100%]\n14 passed, 1 warning in 0.12s' },
          { tag: '.NET', text: 'Passed!  - Failed:     0, Passed:    14, Skipped:     0, Total:    14' },
        ]}
      />

      <h2>Try it with curl and openssl</h2>
      <div className="prose">
        <p>
          Start the receiver. Without <code>WEBHOOK_SECRETS</code> it makes a secret for this run and prints it. Then play
          the sender from a second terminal: <code>openssl dgst -hmac</code> computes the same HMAC-SHA256 as the sender
          modules.
        </p>
      </div>
      <StackTerminal
        title="Start the receiver on port 3000"
        node={`cd snippets/${T}/node\nnpm start`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m uvicorn server:app --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet run --project Api --urls http://localhost:3000`}
      />
      <Output caption="The receiver prints the secret it uses for this run">{`
No WEBHOOK_SECRETS set. This run uses: whsec_EV_i71q1A4yfHYfWErOYhqV4g7KGQ1Shw6SZU0G87wc
`}</Output>
      <Output caption="Signing and sending from the shell (all three receivers answer identically)">{`
$ SECRET=whsec_EV_i71q1A4yfHYfWErOYhqV4g7KGQ1Shw6SZU0G87wc
$ BODY='{"id":"evt_1","type":"order.paid","data":{"orderId":"ord_1001","amount":4200}}'
$ T=$(date +%s)
$ SIG=$(printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')
$ echo "t=$T,v1=$SIG"
t=1792297541,v1=27f14e6a71b5bdda871a687b63985986f5d02cbc9ddf6c6ff31bc8a4fea3745c
$ curl -s localhost:3000/webhooks/orders -H 'Content-Type: application/json' -H "Webhook-Signature: t=$T,v1=$SIG" -d "$BODY" -w ' [%{http_code}]\\n'
{"received":true,"type":"order.paid"} [200]
# The same request again: a replay
$ curl -s localhost:3000/webhooks/orders -H 'Content-Type: application/json' -H "Webhook-Signature: t=$T,v1=$SIG" -d "$BODY" -w ' [%{http_code}]\\n'
{"error":"This delivery was already received."} [409]
# Change the amount but keep the signature
$ curl -s localhost:3000/webhooks/orders -H 'Content-Type: application/json' -H "Webhook-Signature: t=$T,v1=$SIG" -d "\${BODY/4200/1}" -w ' [%{http_code}]\\n'
{"error":"Signature does not match."} [400]
# A correct signature made 10 minutes ago
$ OLD=$((T - 600)); OLDSIG=$(printf '%s.%s' "$OLD" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')
$ curl -s localhost:3000/webhooks/orders -H 'Content-Type: application/json' -H "Webhook-Signature: t=$OLD,v1=$OLDSIG" -d "$BODY" -w ' [%{http_code}]\\n'
{"error":"Timestamp outside the tolerance window."} [400]
# The same old signature with the current time put in t
$ curl -s localhost:3000/webhooks/orders -H 'Content-Type: application/json' -H "Webhook-Signature: t=$T,v1=$OLDSIG" -d "$BODY" -w ' [%{http_code}]\\n'
{"error":"Signature does not match."} [400]
# No signature at all
$ curl -s localhost:3000/webhooks/orders -H 'Content-Type: application/json' -d "$BODY" -w ' [%{http_code}]\\n'
{"error":"Missing Webhook-Signature header."} [400]
`}</Output>

      <h2>Signing any request: HTTP Message Signatures</h2>
      <div className="prose">
        <p>
          The webhook format above signs one thing, the body. When services call each other’s APIs, you may want to sign
          the method, the path, the host and some headers as well, so a signed <code>GET /accounts/1</code> cannot be
          turned into <code>DELETE /accounts/1</code>. <strong>HTTP Message Signatures (RFC 9421, 2024)</strong> is the
          standard for that. The sender lists the parts it signs in a <code>Signature-Input</code> header (for example{' '}
          <code>"@method" "@path" "@authority" "content-digest"</code>, with <code>created</code>, <code>expires</code>{' '}
          and <code>keyid</code> parameters) and puts the result in a <code>Signature</code> header. The body is covered
          through a <code>Content-Digest</code> header (RFC 9530). Algorithms include HMAC-SHA256 and public-key ones such as
          Ed25519 and ECDSA P-256, where the receiver holds only a public key. Replays are still the verifier’s job: it
          must enforce <code>created</code> and <code>expires</code> itself, and can require a <code>nonce</code>{' '}
          parameter and remember the ones it has seen, just like the replay cache in this chapter.
        </p>
        <p>
          AWS Signature Version 4 is a widely used older scheme of the same kind: an HMAC-SHA256 over a canonical form of
          the request, including a timestamp. For webhooks, the simple format in this chapter is what you will meet most.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Verifying a re-serialized body</td><td>Genuine webhooks fail, so verification gets switched off</td><td>Verify the raw bytes, then parse</td></tr>
          <tr><td>Comparing signatures with <code>==</code></td><td>Response timing can reveal a forged signature byte by byte</td><td><code>timingSafeEqual</code>, <code>hmac.compare_digest</code>, <code>FixedTimeEquals</code></td></tr>
          <tr><td>Signing the body without a timestamp</td><td>A recorded request can be replayed forever</td><td>Sign <code>&lt;t&gt;.&lt;body&gt;</code> and allow 5 minutes</td></tr>
          <tr><td>Checking a timestamp that is not signed</td><td>An attacker simply sends a fresh one</td><td>Put the timestamp inside the HMAC input</td></tr>
          <tr><td>Spotting replays by the header text, or by an id header that is not signed</td><td>The attacker rewrites the header or swaps the id; the signature still verifies</td><td>Key the replay cache on what was signed</td></tr>
          <tr><td><code>SHA-256(secret + body)</code></td><td>Length extension lets an attacker add bytes and keep a valid hash</td><td>HMAC-SHA256</td></tr>
          <tr><td>Parsing the JSON before verifying</td><td>Anyone on the internet reaches your parser and handler code</td><td>Verify first; reject early</td></tr>
          <tr><td>Slow work before answering</td><td>The sender times out and retries, so events are processed twice</td><td>Queue the event, answer 200, deduplicate by event id</td></tr>
          <tr><td>The secret in code or logs</td><td>Anyone who reads it can forge webhooks</td><td>A secret store or environment variable, and a rotation plan</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="An attacker records a genuine webhook and sends it again 10 minutes later. What stops it, and why can’t the attacker just put the current time in t?">
        <p>
          The timestamp check: <code>t</code> is 600 seconds old, outside the 5-minute window, so the receiver answers 400.
          The attacker cannot update <code>t</code> because <code>t</code> is part of the signed string; a new{' '}
          <code>t</code> needs a new HMAC, and computing one needs the secret. A resend within the 5 minutes is caught by the
          replay cache instead.
        </p>
      </Checkpoint>
      <Checkpoint question="Chapter 07 stores only a hash of each API key. Why must a webhook receiver keep the secret itself?">
        <p>
          To verify, the receiver recomputes the HMAC, and that needs the key. A hash of the secret would be useless. So the
          secret belongs in a secret store (a key vault, or an environment variable fed from one), never in the repository
          or a log, and a leak means rotating it, because whoever has it can sign webhooks of their own.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does the replay cache store a digest of “<t>.<body>” rather than the signature header?">
        <p>
          Because the header text can change while the signature stays valid. Even with one secret, an attacker can add a
          space after the comma, repeat the <code>v1</code>, or append a <code>v0</code> the receiver ignores; during
          rotation they can also drop one of the two <code>v1</code> values. Each version is new header text, and each
          verifies. The signed content is the same in every case, so keying the cache on it catches the replay whatever
          the header looks like.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the receiver in your stack, then make it idempotent: remember processed
                event ids for three days and answer <code>200</code> without processing a duplicate again.
              </>
            ),
            hint: <>Check the id after verifying and parsing. Store ids with an expiry (a dictionary with a clock in the tests, Redis in production). A test: deliver the same event twice with different timestamps and check it was handled once.</>,
          },
          {
            task: <>Give the sender retries: on a timeout or a non-2xx status, retry up to five times with growing delays, signing each attempt with a fresh timestamp.</>,
            hint: <>Delays such as 1 s, 2 s, 4 s, 8 s with some random jitter. Put the clock and a sleep function behind parameters so the test does not wait. Re-signing is what keeps old attempts from failing the 5-minute check.</>,
          },
          {
            task: <>Add a GitHub-style endpoint that verifies <code>X-Hub-Signature-256: sha256=&lt;hex&gt;</code> over the body alone.</>,
            hint: <>Strip the <code>sha256=</code> prefix and compare in constant time. Deduplicating on the <code>X-GitHub-Delivery</code> header catches GitHub’s own duplicates, but that header is not signed, so an attacker can replay a recorded body with a new id. Without a signed timestamp, only remembering every body digest for good stops that.</>,
          },
          {
            task: <>Switch to public-key signatures, so the receiver holds only a public key and cannot itself forge webhooks.</>,
            hint: <>Ed25519: <code>crypto.sign(null, data, privateKey)</code> in Node.js, <code>Ed25519PrivateKey</code> from <code>cryptography</code> in Python. .NET has no built-in Ed25519, so use <code>ECDsa</code> with the P-256 curve there. Sign the same <code>&lt;t&gt;.&lt;body&gt;</code> string.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>An HMAC proves a request came from someone holding the shared secret and was not changed; the secret never travels.</li>
          <li>Sign <code>&lt;timestamp&gt;.&lt;body&gt;</code>, send <code>t</code> and <code>v1</code> in a header, and serialize once so you send exactly what you signed.</li>
          <li>Verify the raw bytes before parsing, compare in constant time, allow 5 minutes of clock difference, and remember recent deliveries to stop replays.</li>
          <li>Accept several active secrets so you can rotate without missing deliveries; keep the secret in a secret store, not a hash.</li>
          <li>For signing whole requests between services, look at HTTP Message Signatures (RFC 9421).</li>
        </ul>
      </Recap>
    </>
  );
}
