import { Code } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { mutualTls } from '../diagrams/specs/mtls';

const T = '17-mtls';

export function Mtls() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours in one stack"
        project={T}
        learn={[
          'How TLS client authentication works: the server asks for a certificate, and the client proves it holds the private key',
          'Making a small certificate authority, a server certificate and client certificates',
          'Requiring a client certificate from your CA in Node.js, Python (uvicorn) and ASP.NET Core (Kestrel)',
          'Mapping a certificate to a registered client, and answering 403 for a genuine one you do not know',
          'Where mutual TLS fits, certificate-bound tokens (RFC 8705), and how to rotate and revoke certificates',
        ]}
        tools={[
          { name: 'Node.js', what: 'node:https with requestCert and rejectUnauthorized; the openssl command (OpenSSL 3.4 or later) makes the certificates.' },
          { name: 'Python', what: 'ssl.SSLContext with CERT_REQUIRED under uvicorn; the cryptography package makes the certificates.' },
          { name: '.NET', what: 'Kestrel with ClientCertificateMode.RequireCertificate and AddCertificate(); CertificateRequest makes the certificates.' },
        ]}
      />

      <div className="prose">
        <p>
          Ordinary HTTPS proves one side only: the server shows a certificate, and the client checks it. The server learns
          nothing about the client, so the client then proves itself some other way: a password, an API key, a token.
          <strong> Mutual TLS</strong> (<strong>mTLS</strong>) makes the client show a certificate too, during the same
          handshake, before a single byte of HTTP is read.
        </p>
        <p>
          That has three useful properties. No secret crosses the network: the client proves it holds a private key by
          signing, and the key never leaves it (it can live in a hardware module that cannot export it). A request
          without a good certificate never reaches your code. And the identity is cryptographic, issued by a
          certificate authority you control. The price is operational: issuing, distributing, rotating and revoking
          certificates.
        </p>
      </div>

      <h2>The words you need</h2>
      <TableWrap>
        <thead>
          <tr><th>Term</th><th>What it is</th></tr>
        </thead>
        <tbody>
          <tr><td>Certificate</td><td>A public key plus facts about its owner (the <strong>subject</strong>), signed by an <strong>issuer</strong>. Format: X.509. Files here: <code>.crt</code>, in PEM text.</td></tr>
          <tr><td>Private key</td><td>The secret half of the key pair. Whoever holds it can act as the certificate’s subject. Files here: <code>.key.pem</code>, never committed.</td></tr>
          <tr><td>Certificate authority (CA)</td><td>A key whose job is to sign certificates. Trusting a CA means trusting every certificate it signs.</td></tr>
          <tr><td>Chain</td><td>Certificate → the CA that signed it → … → a root you trust. Checking a certificate means building this chain.</td></tr>
          <tr><td>Common name (CN), SAN</td><td>Names in a certificate. CN is part of the subject; the Subject Alternative Name extension lists host names, IPs or URIs.</td></tr>
          <tr><td>Extended key usage (EKU)</td><td>What the certificate may be used for: <code>serverAuth</code>, <code>clientAuth</code>. TLS libraries check it.</td></tr>
          <tr><td>Fingerprint</td><td>The SHA-256 hash of the certificate’s bytes (DER). It names one exact certificate.</td></tr>
        </tbody>
      </TableWrap>

      <h2>How the handshake proves the client</h2>
      <div className="prose">
        <ol>
          <li>The client connects and says hello.</li>
          <li>
            The server sends its own certificate, as in any HTTPS connection, plus a <strong>CertificateRequest</strong>:
            “send me yours”. It can list the CAs it accepts.
          </li>
          <li>
            The client checks the server’s certificate, then sends its certificate and a <strong>CertificateVerify</strong>
            message: a signature, made with its private key, over the handshake so far. A copied certificate is useless
            without the key, because the signature covers this connection’s random values.
          </li>
          <li>
            The server builds the chain from the client’s certificate to a CA it trusts, checks the dates and the EKU, and
            verifies the signature. If anything fails, it ends the connection, usually with an alert. No HTTP request is
            read.
          </li>
          <li>Only now does HTTP start, and your code asks the connection which certificate the client presented.</li>
        </ol>
        <p>
          In TLS 1.3 the client’s certificate travels encrypted, and the client may already think the handshake is done
          when the server’s refusal arrives. That is why a refused client in the tests sees “certificate required”, a
          reset connection or an empty reply on its first read, rather than a clean HTTP error.
        </p>
      </div>

      <Diagram spec={mutualTls} caption="Your CA issues the client certificate; the API trusts only that CA. A missing or foreign certificate ends the handshake; a genuine one is then mapped to a registered client, or answered with 403." />

      <h2>Where mutual TLS fits</h2>
      <TableWrap>
        <thead>
          <tr><th>Machine sign-in</th><th>What the client proves</th><th>Secret on the wire?</th><th>Good for</th></tr>
        </thead>
        <tbody>
          <tr><td>API key (chapter 07)</td><td>It knows a string</td><td>Yes, on every request</td><td>Simple public APIs, low setup</td></tr>
          <tr><td>HMAC signature (chapter 10)</td><td>It knows a shared secret</td><td>No, but the server holds the same secret</td><td>Webhooks, request integrity</td></tr>
          <tr><td>OAuth client credentials (chapter 11)</td><td>It knows a client secret, or holds a signing key</td><td>The secret, or a signed assertion, at the token endpoint</td><td>Scoped, short-lived tokens across many APIs</td></tr>
          <tr><td>Mutual TLS</td><td>It holds a private key your CA certified</td><td>No: only a signature</td><td>Service-to-service, B2B and banking APIs, devices</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <ul>
          <li>
            <strong>Service meshes.</strong> Istio, Linkerd and Consul give every service a certificate (often a SPIFFE ID
            such as <code>spiffe://example.com/ns/billing/sa/api</code> in the SAN) that lasts a day or less, and encrypt and
            authenticate every call between services with mTLS, without changing application code.
          </li>
          <li>
            <strong>B2B APIs.</strong> Payment networks, banks and large partners exchange certificates once and call each
            other’s APIs over mTLS, often in addition to OAuth tokens.
          </li>
          <li>
            <strong>Open banking.</strong> The FAPI security profiles used by UK Open Banking and similar schemes require
            sender-constrained tokens: FAPI 1.0 Advanced binds them to the client’s certificate (RFC 8705, below), and
            FAPI 2.0 accepts that or DPoP (RFC 9449). European PSD2 APIs identify third-party providers by their eIDAS
            certificates.
          </li>
          <li><strong>Devices and internal admin APIs</strong>, where the key can sit in a TPM or secure element.</li>
        </ul>
      </div>

      <Step n={1}>Make a small certificate authority</Step>
      <div className="prose">
        <p>
          Each project can make the same set of files in a folder you choose. The tests use a fresh temporary folder (or,
          in .NET, memory) and delete it afterwards. The servers use a folder under your temporary directory that only
          you can read, and keep it until you delete it. Nothing is ever written into the project, and
          <code> .key.pem</code> files are ignored by git.
        </p>
        <ul>
          <li><strong>A CA</strong>: self-signed, with <code>basicConstraints CA:TRUE</code> and permission to sign certificates.</li>
          <li><strong>A server certificate</strong> for <code>localhost</code> and <code>127.0.0.1</code> (in the SAN), with EKU <code>serverAuth</code>.</li>
          <li><strong>Client certificates</strong> with EKU <code>clientAuth</code>: <code>billing-service</code> (registered), <code>reports-service</code> (genuine but unregistered), and <code>stranger</code>, which says <code>billing-service</code> but comes from a different CA.</li>
        </ul>
        <p>
          The tests add four of their own, all from your CA and all for <code>billing-service</code>: a renewed
          certificate, an expired one, one made for servers (EKU <code>serverAuth</code> only), and one with the name in
          the organization field (<code>O=billing-service</code>) instead of the common name.
        </p>
        <p>
          All keys are ECDSA P-256 and the certificates last 30 days. Short lives are a feature: they limit how long a
          stolen key is useful, and they force you to automate renewal early.
        </p>
      </div>
      <StackFiles
        label="The certificate authority"
        node={`${T}/node/src/pki.ts`}
        python={`${T}/python/pki.py`}
        dotnet={`${T}/dotnet/Api/Pki.cs`}
      />
      <Box kind="tip" label="One CA here, two in production">
        <p>
          To keep the lab small, one CA signs both the server certificate and the client certificates. In production the
          server usually has a certificate from a public CA (so any client can check it), while client certificates come
          from your own private CA, and the server trusts <em>only</em> that private CA for clients. Never accept client
          certificates from the public CAs your machine trusts: anyone can buy one.
        </p>
      </Box>

      <Step n={2}>Require a client certificate, then map it to a client</Step>
      <div className="prose">
        <p>The server needs three things: its own certificate and key, the CA it trusts for clients, and the rule “no certificate, no connection”.</p>
        <ul>
          <li>
            <strong>Node.js:</strong> <code>https.createServer</code> with <code>requestCert: true</code> (ask) and
            <code> rejectUnauthorized: true</code> (refuse missing or untrusted certificates), and <code>ca</code> set to
            your CA, which replaces Node’s built-in list of public CAs for this server. In the app,
            <code> req.socket.getPeerCertificate()</code> returns the verified certificate.
          </li>
          <li>
            <strong>Python:</strong> an <code>ssl.SSLContext</code> with <code>verify_mode = CERT_REQUIRED</code> and your
            CA loaded with <code>load_verify_locations</code>. A new context trusts nothing until you load a CA; never
            call <code>load_default_certs()</code> on it, which adds the system’s public roots. uvicorn uses the
            context but does not pass the client certificate to the app, so <code>tls.py</code> adds a small protocol
            class that puts it where the ASGI TLS extension says it goes:
            <code> scope["extensions"]["tls"]["client_cert_chain"]</code>. The class relies on two uvicorn internals
            that are not a public API (asyncio calls <code>connection_made</code> only after the handshake, and the
            protocol reads <code>self.app</code> again for each request). Pin uvicorn’s version, as
            <code> requirements.txt</code> does, and run the tests after upgrading. If an upgrade breaks the class, the app
            sees no certificate and answers 401: it fails closed.
          </li>
          <li>
            <strong>.NET:</strong> Kestrel with <code>ClientCertificateMode.RequireCertificate</code>. Set
            <code> ClientCertificateValidation</code> too: without it, Kestrel would accept any certificate that chains to
            the machine’s trusted roots, public CAs included. Then <code>AddCertificate()</code> checks the chain again
            against your CA (<code>CustomRootTrust</code>) and turns the certificate into a signed-in user in
            <code> OnCertificateValidated</code>.
          </li>
        </ul>
        <p>
          A certificate that passed the handshake is genuine: your CA issued it, and the client holds its key. Whether you
          serve that client is a separate question. The app looks the subject’s common name up in a registry of known
          clients, with the scopes each may use, and answers <code>403 Unknown client certificate.</code> if it is not
          there. It insists on exactly one CN: a certificate with none, or several, is unknown. (In .NET that rules out
          <code> GetNameInfo(X509NameType.SimpleName)</code>, which falls back to other fields such as O when there is no
          CN, so the code reads the CN from the subject itself.) It also returns the certificate’s SHA-256 fingerprint,
          which comes up again with RFC 8705.
        </p>
      </div>
      <StackFiles
        label="The mutual TLS server"
        node={[`${T}/node/src/tls.ts`, `${T}/node/src/app.ts`, `${T}/node/src/server.ts`]}
        python={[`${T}/python/tls.py`, `${T}/python/app.py`, `${T}/python/server.py`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="key" label="Name or fingerprint?">
        <p>
          Mapping by subject, as here, survives renewal: next month’s certificate for <code>billing-service</code> works
          with no change on the server (a test proves it). It relies on your CA never issuing that name to anyone else,
          and on the server trusting only that CA, which is why the <code>stranger</code> certificate, same name but
          another CA, never gets past the handshake. Mapping by fingerprint pins one exact certificate instead: nothing
          else matches, even from your own CA, but you must register the next fingerprint before each renewal. Many
          systems keep both: the subject for identity, the fingerprint for audit logs and token binding.
        </p>
      </Box>
      <Box kind="tip" label="Testing in .NET: TestServer has no TLS">
        <p>
          <code>WebApplicationFactory</code>’s in-memory TestServer passes requests straight to the app, with no TLS and
          so no client certificate. That is why <code>Program.CreateApp</code> exists: the tests call it with their own
          certificates and port 0, start real Kestrel, and read the address it picked from <code>app.Urls</code>. Python’s
          tests do the same with uvicorn in a background thread, and Node’s with <code>server.listen(0)</code>.
        </p>
      </Box>

      <Step n={3}>Run the tests</Step>
      <div className="prose">
        <p>
          Each stack runs the same eight tests against a real TLS server on a free port: the registered client is
          accepted and identified; a client with no certificate, a certificate from another CA (with a registered name),
          an expired certificate and a certificate made for servers are each refused during the handshake; a genuine but
          unregistered certificate and one without a common name get 403; and a renewed certificate for the same client
          is accepted with a new fingerprint. The refusal tests also check that the connection was made before it was
          cut, so a server that is not running cannot make them pass.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={`${T}/node/test/mtls.test.ts`}
        python={`${T}/python/test_mtls.py`}
        dotnet={`${T}/dotnet/Api.Tests/MtlsTests.cs`}
      />
      <StackTerminal
        title="Run the tests"
        node={`cd snippets/${T}/node\nnpm test`}
        python={`cd snippets/${T}/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/${T}/dotnet\ndotnet test`}
      />
      <Output
        panes={[
          { tag: 'Node.js', text: 'ℹ tests 8\nℹ pass 8\nℹ fail 0' },
          { tag: 'Python', text: '........                 [100%]\n8 passed' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 8, Skipped: 0, Total: 8' },
        ]}
      />

      <h2>Try it with curl</h2>
      <div className="prose">
        <p>
          Each server makes the certificates on its first start, in the folder <code>CERTS_DIR</code> names. The three
          projects write the same files, so you can start one server, stop it, and start another on the same folder.
          The folder stays after the server stops; delete it when you are done (<code>rm -r /tmp/auth-lab-mtls</code>).
        </p>
      </div>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nCERTS_DIR=/tmp/auth-lab-mtls npm start`}
        python={`cd snippets/${T}/python\nCERTS_DIR=/tmp/auth-lab-mtls ../../.venv/bin/python server.py`}
        dotnet={`cd snippets/${T}/dotnet\nCERTS_DIR=/tmp/auth-lab-mtls dotnet run --project Api`}
      />
      <Output caption="The same session against each server (all three answer identically)">{`
$ C=/tmp/auth-lab-mtls
$ curl -s --cacert $C/ca.crt --cert $C/client.crt --key $C/client.key.pem https://localhost:3000/whoami
{"client":"billing-service","scopes":["invoices:read"],"fingerprint":"16cc4353b9657ee808d20070ac4f3c2cf6d714ee6e8e74a7726851438d3ab73d"}
$ openssl x509 -in $C/client.crt -noout -subject -issuer -fingerprint -sha256
subject=CN=billing-service
issuer=CN=Auth Lab CA
sha256 Fingerprint=16:CC:43:53:B9:65:7E:E8:08:D2:00:70:AC:4F:3C:2C:F6:D7:14:EE:6E:8E:74:A7:72:68:51:43:8D:3A:B7:3D
$ curl -s -w ' %{http_code}\\n' --cacert $C/ca.crt --cert $C/unknown.crt --key $C/unknown.key.pem https://localhost:3000/whoami
{"error":"Unknown client certificate."} 403
`}</Output>
      <div className="prose">
        <p>
          <code>--cacert</code> is the client’s side of “mutual”: curl checks the server’s certificate against your CA.
          <code> --cert</code> and <code>--key</code> are the client’s certificate and key. Your fingerprint will differ:
          the certificates are new on every machine. Now leave out the certificate, or use the stranger’s. These
          refusals happen inside TLS, so each server’s TLS library words them differently, and curl reports what it sees.
        </p>
      </div>
      <Output
        caption="Refused during the handshake: what curl reports from each server"
        panes={[
          { tag: 'Node.js', text: '$ curl -sS --cacert $C/ca.crt https://localhost:3000/whoami\ncurl: (56) LibreSSL SSL_read: LibreSSL/3.3.6: error:1404C45C:SSL routines:ST_OK:reason(1116), errno 0\n$ curl -sS --cacert $C/ca.crt --cert $C/stranger.crt --key $C/stranger.key.pem https://localhost:3000/whoami\ncurl: (56) Recv failure: Connection reset by peer' },
          { tag: 'Python', text: '$ curl -sS --cacert $C/ca.crt https://localhost:3000/whoami\ncurl: (56) Recv failure: Connection reset by peer\n$ curl -sS --cacert $C/ca.crt --cert $C/stranger.crt --key $C/stranger.key.pem https://localhost:3000/whoami\ncurl: (52) Empty reply from server' },
          { tag: '.NET', text: '$ curl -sS --cacert $C/ca.crt https://localhost:3000/whoami\ncurl: (16) Error in the HTTP2 framing layer\n$ curl -sS --cacert $C/ca.crt --cert $C/stranger.crt --key $C/stranger.key.pem https://localhost:3000/whoami\ncurl: (16) Error in the HTTP2 framing layer' },
        ]}
      />
      <div className="prose">
        <p>
          Reason 1116 is the TLS 1.3 alert 116, <code>certificate_required</code>, which the version of LibreSSL in macOS’s
          curl does not have a name for. The other messages are the server closing the connection mid-handshake. Node.js
          checks the chain itself once OpenSSL finishes, and drops a bad certificate without an alert, so curl sees a
          reset; Kestrel had already agreed HTTP/2 with curl, so curl blames the HTTP/2 layer. In every case no HTTP
          request reached the app.
        </p>
      </div>

      <h2>Behind a load balancer</h2>
      <div className="prose">
        <p>
          Often TLS ends at a load balancer or ingress (Envoy, NGINX, AWS ALB, Azure Application Gateway or App Service),
          which checks the client certificate and forwards it to your app in a header: <code>X-Forwarded-Client-Cert</code>
          in Envoy, <code>X-ARR-ClientCert</code> in Azure App Service, a header you name in NGINX. Your code then reads the
          header instead of the socket. The rules: the proxy must verify the certificate against your CA (not just ask for
          one), it must remove any copy of that header sent by the client, and your app must accept the header only from
          the proxy (a private network, or mTLS between proxy and app). ASP.NET Core has
          <code> AddCertificateForwarding()</code> for this.
        </p>
      </div>

      <h2>Certificate-bound tokens (RFC 8705)</h2>
      <div className="prose">
        <p>
          RFC 8705 (OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens) joins mTLS and OAuth in
          two ways. First, a client can authenticate to the token endpoint with its certificate instead of a client secret
          (<code>tls_client_auth</code> with a CA, or <code>self_signed_tls_client_auth</code> with a registered
          certificate). Second, the authorization server can <strong>bind</strong> the access token to that certificate by
          putting its thumbprint in the token’s <code>cnf</code> claim. A resource server then accepts the token only over
          an mTLS connection that presents the same certificate, so a stolen token is useless without the private key.
        </p>
      </div>
      <Code title="A certificate-bound access token's claims (an example, not produced by these projects)" lang="json">{`
{
  "iss": "https://auth.example.com",
  "sub": "billing-service",
  "aud": "https://api.example.com",
  "scope": "invoices:read",
  "exp": 1792239300,
  "cnf": { "x5t#S256": "FsxDU7llfugI0gBwrE88LPbXFO5ujnSncmhRQ406tz0" }
}
`}</Code>
      <div className="prose">
        <p>
          <code>x5t#S256</code> is the same SHA-256 fingerprint the projects return, written in base64url instead of hex.
          The value above is the curl session’s certificate. To check a bound token, hash the certificate on the
          connection and compare: in Node.js, <code>createHash('sha256').update(cert.raw).digest('base64url')</code>.
        </p>
      </div>

      <h2>Rotation and revocation</h2>
      <div className="prose">
        <ul>
          <li>
            <strong>Rotate before expiry, with overlap.</strong> Issue the new certificate while the old one still works,
            deploy it, then let the old one expire. With subject mapping the server needs no change; with fingerprint
            pinning, register the new fingerprint first. Automate it: cert-manager in Kubernetes, a mesh’s built-in CA,
            or your cloud’s private CA service.
          </li>
          <li>
            <strong>Rotate the CA too.</strong> Trust the old and new CA side by side (a bundle in <code>ca</code>), move
            clients over, then remove the old one.
          </li>
          <li>
            <strong>Revoke a stolen key.</strong> A certificate stays valid until it expires unless the server checks
            revocation: a CRL (a signed list of revoked serial numbers that the CA publishes) or OCSP (an online status
            check). These projects turn revocation checking off because their CA publishes neither; a production CA must
            publish one, and the server must check it. The simplest robust answer is short-lived certificates (hours or
            days), which is what service meshes do, plus a deny list of serial numbers for emergencies.
          </li>
        </ul>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td><code>rejectUnauthorized: false</code> or <code>CERT_OPTIONAL</code>, then not checking</td><td>Any certificate, or none, gets in</td><td>Require and verify in the handshake; check again in the app</td></tr>
          <tr><td>Trusting the machine’s public CAs for client certificates</td><td>Anyone can buy a certificate with any name they own</td><td>Trust only your private client CA (Kestrel: set <code>ClientCertificateValidation</code>)</td></tr>
          <tr><td>Matching the CN without restricting the issuer</td><td>Another CA can issue the same name</td><td>One trusted CA per purpose, or pin fingerprints</td></tr>
          <tr><td>Taking the name from a “display name” helper or the first CN</td><td>It may fall back to another field (O) or pick one of several CNs</td><td>Require exactly one CN (or a SAN URI), and treat anything else as unknown</td></tr>
          <tr><td>Trusting a forwarded certificate header from anywhere</td><td>A client sends the header itself and becomes anyone</td><td>Accept it only from your proxy, which strips client copies</td></tr>
          <tr><td>Long-lived certificates and no revocation</td><td>A stolen key works for years</td><td>Short lifetimes, automated renewal, CRL or OCSP</td></tr>
          <tr><td>Private keys in the repository or the container image</td><td>Everyone with the image can be that client</td><td>Generate per environment; keep keys in a secret store, TPM or HSM</td></tr>
          <tr><td>Treating “authenticated” as “authorized”</td><td>Every certificate from your CA can call every endpoint</td><td>Map each certificate to a client and its scopes (chapter 18)</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="The stranger certificate says CN=billing-service, a registered name. Why is it refused, and why is it refused before your app code runs?">
        <p>
          Because the server trusts only the lab’s CA for client certificates, and the stranger certificate was signed by
          another CA, so its chain does not lead to a trusted root. Chain checking is part of the TLS handshake
          (<code>rejectUnauthorized</code>, <code>CERT_REQUIRED</code>, Kestrel’s <code>ClientCertificateValidation</code>),
          so the connection ends before any HTTP is read. A name in a certificate means nothing until you know who signed it.
        </p>
      </Checkpoint>
      <Checkpoint question="Your load balancer terminates TLS, verifies client certificates, and forwards them to your app in a header. What else must be true for the app to trust that header?">
        <p>
          The load balancer must verify the certificate against your client CA (not just request one), it must strip any
          header of that name that arrives from the client, and the app must accept the header only from the load
          balancer: over a private network, or over mTLS between the two. Otherwise any client can send the header and
          claim any certificate.
        </p>
      </Checkpoint>
      <Checkpoint question="What does a certificate-bound access token (RFC 8705) protect against that a normal bearer token does not?">
        <p>
          Theft. A bearer token works for whoever holds it. A bound token carries the client certificate’s thumbprint in
          <code> cnf.x5t#S256</code>, and the resource server accepts it only over an mTLS connection presenting that same
          certificate, which requires the private key. A token copied from a log or a proxy is useless on its own.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then switch the registry to SHA-256
                fingerprints, allowing two per client so a renewal can overlap.
              </>
            ),
            hint: <>Store <code>{'{ fingerprint → client }'}</code> and look up the presented certificate’s hash. Write the rotation test first: register the renewed fingerprint, accept both, then remove the old one and check it gets 403.</>,
          },
          {
            task: <>Add an emergency deny list: refuse certificates whose serial number is listed, with 403 <code>Certificate revoked.</code></>,
            hint: <>Node.js: <code>getPeerCertificate().serialNumber</code>; Python: <code>cert.serial_number</code>; .NET: <code>cert.SerialNumber</code>. Compare in one normalized form (uppercase hex, no leading zeros).</>,
          },
          {
            task: <>Issue a certificate-bound token: <code>POST /token</code> over mTLS returns a JWT with <code>cnf.x5t#S256</code>, and <code>GET /invoices</code> requires both the token and the same certificate.</>,
            hint: <>Reuse chapter 08’s signing code. The thumbprint is the base64url SHA-256 of the certificate’s DER bytes. Test that a token used with the renewed certificate is refused.</>,
          },
          {
            task: <>Identify clients by a SPIFFE-style URI in the SAN (<code>spiffe://example.com/billing</code>) instead of the common name.</>,
            hint: <>Add the URI with <code>subjectAltName=URI:…</code> (openssl), <code>x509.UniformResourceIdentifier</code> (cryptography) or <code>SubjectAlternativeNameBuilder.AddUri</code> (.NET), then read the SAN extension on the server.</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>Mutual TLS makes the client present a certificate and prove, by signing the handshake, that it holds the private key.</li>
          <li>Require the certificate in the handshake, and trust only your own client CA for it, never the machine’s public CAs.</li>
          <li>A genuine certificate is not permission: map it to a registered client and its scopes, and answer 403 otherwise.</li>
          <li>Keep certificates short-lived, rotate with overlap, and have a revocation story; bind tokens to certificates with RFC 8705 where theft matters.</li>
        </ul>
      </Recap>
    </>
  );
}
