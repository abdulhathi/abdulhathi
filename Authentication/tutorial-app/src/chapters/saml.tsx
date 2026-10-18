import { Code, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { ByStack, StackFiles, StackTerminal } from '../components/Stacks';
import { Diagram } from '../diagrams/Diagram';
import { samlSpInitiated } from '../diagrams/specs/saml';

const T = '13-saml';

export function Saml() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours in one stack"
        project={T}
        learn={[
          'How SP-initiated single sign-on works: an AuthnRequest out by redirect, a signed Response back by form post',
          'What SAML metadata is, and which values you and the identity provider exchange',
          'Verifying the XML signature with the IdP’s certificate, exclusive canonicalization, and why signature wrapping works',
          'Every check a service provider must make: Issuer, Audience, Recipient, time window, InResponseTo, one-time use',
          'Mapping NameID and attributes to a local user, and when to choose SAML or OpenID Connect',
        ]}
        tools={[
          { name: 'Node.js', what: 'xml-crypto (XML Signature) and @xmldom/xmldom (an XML parser) with Express 5.' },
          { name: 'Python', what: 'signxml and lxml with FastAPI.' },
          { name: '.NET', what: 'SignedXml from System.Security.Cryptography.Xml in a minimal API.' },
        ]}
      />

      <div className="prose">
        <p>
          <strong>SAML 2.0</strong> (Security Assertion Markup Language, an OASIS standard from 2005) is how most
          companies sign their staff in to business software. An employee signs in once at the company’s
          <strong> identity provider</strong> (the <strong>IdP</strong>: Microsoft Entra ID, Okta, AD FS, Google
          Workspace, Keycloak), and every application that trusts the IdP lets them in without a password of its own.
          If you sell software to businesses, someone will ask “do you support SAML SSO?” before they sign the contract.
        </p>
        <p>
          Your application is the <strong>service provider</strong> (the <strong>SP</strong>). It never sees the user’s
          password. Instead it receives an <strong>assertion</strong>: an XML document, signed by the IdP, that says
          “this is ada@example.com, she signed in at 12:00, and this statement is for you, valid for five minutes.”
          Everything in this chapter is about one question: when may your SP believe an assertion?
        </p>
      </div>

      <h2>The words you need</h2>
      <TableWrap>
        <thead>
          <tr><th>Term</th><th>What it is</th></tr>
        </thead>
        <tbody>
          <tr><td>Entity ID</td><td>A unique name (usually a URL) for each party. Yours goes in the assertion’s Audience; the IdP’s is the Issuer.</td></tr>
          <tr><td>AuthnRequest</td><td>The SP’s request: “please authenticate this user for me, and reply to this address.” It has an ID.</td></tr>
          <tr><td>Response and Assertion</td><td>The IdP’s answer. The Response is the envelope; the Assertion inside is the signed statement about the user.</td></tr>
          <tr><td>NameID</td><td>The user’s identifier in the assertion: an email address, or a stable opaque ID (the “persistent” format).</td></tr>
          <tr><td>Attributes</td><td>Extra facts about the user (email, display name, groups), each with a name and one or more values.</td></tr>
          <tr><td>ACS</td><td>The Assertion Consumer Service: your endpoint that receives the Response. Here, <code>POST /saml/acs</code>.</td></tr>
          <tr><td>Binding</td><td>How a message travels. HTTP-Redirect puts it in a URL; HTTP-POST puts it in an auto-submitted HTML form.</td></tr>
          <tr><td>Metadata</td><td>An XML document each side publishes: its entity ID, its endpoint URLs, and its certificates.</td></tr>
        </tbody>
      </TableWrap>

      <h2>How a sign-in flows</h2>
      <div className="prose">
        <p>
          In the <strong>SP-initiated</strong> flow, the user starts at your app. The browser carries every message:
          the SP and the IdP never talk to each other directly, which is why SAML works even when the IdP sits inside a
          company network your servers cannot reach.
        </p>
        <ol>
          <li>The user opens <code>/saml/login</code> (or a page that needs sign-in).</li>
          <li>
            Your app makes an AuthnRequest with a fresh random ID, remembers the ID, and redirects the browser to the
            IdP’s single sign-on URL. With the HTTP-Redirect binding the request is compressed with raw DEFLATE, Base64
            encoded and put in the <code>SAMLRequest</code> query parameter.
          </li>
          <li>The IdP signs the user in however it likes: password, passkey, MFA, an existing session.</li>
          <li>
            The IdP sends back an HTML page with a hidden form field <code>SAMLResponse</code> (the Base64 XML) and a
            script that submits it at once to your ACS URL (the HTTP-POST binding).
          </li>
          <li>Your ACS checks the response, every part of it, then starts a session for the user.</li>
        </ol>
      </div>

      <Diagram spec={samlSpInitiated} caption="SP-initiated sign-in: the AuthnRequest goes out in a redirect, the signed Response comes back in a form post, and the SP checks it before believing it." />

      <TableWrap>
        <thead>
          <tr><th>Message</th><th>From → to</th><th>Binding</th><th>Signed?</th></tr>
        </thead>
        <tbody>
          <tr><td>AuthnRequest</td><td>SP → IdP</td><td>HTTP-Redirect: <code>?SAMLRequest=</code> deflated + Base64</td><td>Optional (a separate signature over the query string)</td></tr>
          <tr><td>Response with Assertion</td><td>IdP → SP</td><td>HTTP-POST: form field <code>SAMLResponse</code>, Base64</td><td>Yes: the assertion, the response, or both, with XML Signature</td></tr>
        </tbody>
      </TableWrap>

      <h2>Metadata: what you exchange with the IdP</h2>
      <div className="prose">
        <p>
          Before the first sign-in, the two sides swap metadata. Your app publishes its entity ID and ACS URL (these
          projects serve it at <code>GET /saml/metadata</code>); the IdP’s administrator loads it, or types the values
          into a form. The IdP gives you its entity ID, its sign-in URL and its <strong>signing certificate</strong>.
          That certificate is the trust anchor of the whole system: an assertion is genuine only if it verifies with
          that certificate.
        </p>
      </div>
      <Code title="An IdP's metadata (shortened; configuration, not used by the tests)" lang="xml">{`
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com/saml">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data><ds:X509Certificate>MIIC8DCCAdigAwIBAgIQ...</ds:X509Certificate></ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                            Location="https://idp.example.com/saml/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>
`}</Code>
      <TableWrap>
        <thead>
          <tr><th>Value</th><th>Who provides it</th><th>In these projects</th><th>What the SP does with it</th></tr>
        </thead>
        <tbody>
          <tr><td>SP entity ID</td><td>You</td><td><code>https://sp.example.com/saml/metadata</code></td><td>Requires it in every assertion’s Audience</td></tr>
          <tr><td>ACS URL</td><td>You</td><td><code>https://sp.example.com/saml/acs</code></td><td>Requires it as the Destination and Recipient</td></tr>
          <tr><td>IdP entity ID</td><td>IdP</td><td><code>https://idp.example.com/saml</code></td><td>Requires it as the Issuer</td></tr>
          <tr><td>IdP SSO URL</td><td>IdP</td><td><code>https://idp.example.com/saml/sso</code></td><td>Sends the AuthnRequest there</td></tr>
          <tr><td>IdP signing certificate</td><td>IdP</td><td>Made by the tests, or by <code>openssl</code> for curl</td><td>Verifies every signature with it, and with nothing else</td></tr>
        </tbody>
      </TableWrap>

      <h2>Why XML signatures are easy to get wrong</h2>
      <div className="prose">
        <p>
          A JWT signs a string of bytes. An XML Signature signs part of a <em>tree</em>, which is far harder, for three
          reasons you will meet in the code.
        </p>
        <ul>
          <li>
            <strong>Canonicalization.</strong> The same XML can be written many ways (attribute order, quotes, namespace
            declarations, whitespace inside tags). Before hashing, both sides convert the signed element to one standard
            form, its <strong>canonical form</strong>. <strong>Exclusive canonicalization</strong>
            (<code>xml-exc-c14n</code>) is the variant SAML uses: it includes only the namespaces the element itself uses,
            so the signed assertion still verifies after it is moved into a different envelope. The canonicalization
            SAML uses also drops comments, which matters below.
          </li>
          <li>
            <strong>References.</strong> The signature does not sit around what it signs. It sits <em>inside</em> the
            assertion (an <strong>enveloped</strong> signature) and points at it by ID: <code>{'<Reference URI="#_a1b2…">'}</code>.
            A verifier that only answers “is there a valid signature somewhere?” tells you nothing about the element you
            then read.
          </li>
          <li>
            <strong>Signature wrapping.</strong> An attacker who has any genuine signed assertion (for their own account)
            keeps it in the document, so the signature still verifies, and adds a forged assertion, for someone else,
            where a careless SP looks first. A 2012 study (“On Breaking SAML”) found 11 of 14 popular SAML frameworks
            open to it. The rule that stops it:
            <strong> see what is signed</strong>. Read the user only from the element the signature covers, and refuse a
            response with more than one assertion anywhere in it: attackers also hide the signed one deeper, in the
            Response’s <code>Extensions</code> or inside the signature’s own <code>Object</code> element.
          </li>
        </ul>
        <p>
          One more: in 2018 several libraries were found to read the NameID’s first text node only. Comments split text,
          and canonicalization ignores comments, so an attacker who owns <code>ada@example.com.evil.example</code> could
          insert <code>{'<!---->'}</code> after <code>ada@example.com</code> without breaking the signature, and be
          signed in as Ada. Reading the whole text of the signed element avoids it; the tests prove it.
        </p>
      </div>

      <h2>Everything the SP must check</h2>
      <TableWrap>
        <thead>
          <tr><th>Check</th><th>Where in the XML</th><th>Stops</th><th>Error in these projects</th></tr>
        </thead>
        <tbody>
          <tr><td>Parse safely, no DTDs</td><td>The whole document</td><td>XXE and “billion laughs” entity attacks</td><td>400 Malformed SAML response.</td></tr>
          <tr><td>Status is Success</td><td><code>samlp:Status/StatusCode</code></td><td>Treating a failed sign-in as a success</td><td>The identity provider did not report success.</td></tr>
          <tr><td>Exactly one assertion</td><td>Anywhere in the Response</td><td>Signature wrapping</td><td>The response must contain exactly one assertion.</td></tr>
          <tr><td>Signature: the IdP’s certificate, RSA-SHA256 (no SHA-1), exclusive c14n, one reference to this assertion’s ID</td><td><code>ds:Signature</code> inside the assertion</td><td>Forged and altered assertions</td><td>Invalid signature.</td></tr>
          <tr><td>Issuer</td><td>The assertion’s <code>saml:Issuer</code></td><td>Assertions from another IdP</td><td>Wrong issuer.</td></tr>
          <tr><td>Recipient is your ACS URL, and so is Destination when present</td><td><code>SubjectConfirmationData/@Recipient</code>, <code>Response/@Destination</code></td><td>An assertion for another app, replayed to yours</td><td>Wrong recipient.</td></tr>
          <tr><td>Audience is your entity ID</td><td><code>Conditions/AudienceRestriction</code></td><td>The same, from the IdP’s point of view</td><td>Wrong audience.</td></tr>
          <tr><td>NotBefore and NotOnOrAfter, with one minute of skew</td><td><code>Conditions</code>, <code>SubjectConfirmationData</code></td><td>Old, captured assertions</td><td>The assertion has expired. / is not valid yet.</td></tr>
          <tr><td>Not used before</td><td>The assertion’s <code>ID</code>, in a replay cache</td><td>Replaying a captured response within its five minutes</td><td>This assertion was already used.</td></tr>
          <tr><td>InResponseTo is a request you sent, once</td><td><code>SubjectConfirmationData/@InResponseTo</code></td><td>Unsolicited responses, login CSRF</td><td>InResponseTo does not match a pending request.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Settings, the AuthnRequest and metadata</Step>
      <div className="prose">
        <p>
          The settings hold the five values from the metadata table. The AuthnRequest is short: an ID (an XML name
          starting with <code>_</code> and 160 random bits, as SAML Core recommends), the time, where to reply
          (<code>AssertionConsumerServiceURL</code> and <code>ProtocolBinding</code>), and your entity ID as its Issuer.
          <code> redirectUrl</code> applies the HTTP-Redirect binding: raw DEFLATE (no zlib header), Base64, URL-encode.
        </p>
      </div>
      <StackFiles
        label="Settings, AuthnRequest and metadata"
        node={`${T}/node/src/saml.ts`}
        python={`${T}/python/saml.py`}
        dotnet={`${T}/dotnet/Api/Saml.cs`}
      />
      <Box kind="tip" label="Compare with your configured URL, not the request">
        <p>
          Your app usually runs behind a load balancer, so the URL it sees (<code>http://10.0.0.7:3000/saml/acs</code>)
          is not the URL the IdP posted to. Keep the public ACS URL in configuration and compare Recipient and Destination
          with that. Never build it from the request’s Host header, which the sender controls.
        </p>
      </Box>

      <Step n={2}>Verify the signature, then every condition</Step>
      <div className="prose">
        <p>
          The validator works through the table above in order and stops at the first failure. Steps 1 to 3 are about
          trust; after step 3 the code reads <em>only</em> from the verified assertion:
        </p>
        <ul>
          <li>
            <strong>Node.js:</strong> xml-crypto checks the signature, and <code>getSignedReferences()</code> returns the
            canonical XML of exactly what was signed. The code parses that string and reads from it.
          </li>
          <li>
            <strong>Python:</strong> signxml’s <code>verify()</code> returns <code>signed_xml</code>, parsed from the same
            canonical bytes. <code>location</code> pins the signature to the Response’s assertion, and
            <code> signature_methods</code> and <code>digest_algorithms</code> allow only SHA-256.
          </li>
          <li>
            <strong>.NET:</strong> <code>SignedXml</code> has no “what was signed” result, so the code proves the
            reference points at this assertion: one reference, URI <code>#</code> + the assertion’s ID, and
            <code> GetIdElement</code> must return this very element (SignedXml already refuses an ID that appears twice).
          </li>
        </ul>
        <p>
          In all three, the key comes from your settings, never from the <code>KeyInfo</code> in the message. An attacker
          can sign anything with their own key and include their own certificate; a verifier that trusts the
          certificate in the message accepts it. The expected algorithms are listed too: no SHA-1, exclusive
          canonicalization, and exactly the enveloped-signature and exclusive c14n transforms.
        </p>
      </div>
      <StackFiles
        label="Validating a SAML Response"
        node={`${T}/node/src/validate.ts`}
        python={`${T}/python/validate.py`}
        dotnet={`${T}/dotnet/Api/ResponseValidator.cs`}
      />
      <Box kind="key" label="Every AudienceRestriction must name you">
        <p>
          SAML Core says each <code>AudienceRestriction</code> is a condition that must hold on its own, so an assertion
          with two restrictions must name you in both. Checking only that your entity ID appears somewhere is a classic
          mistake. The same goes for time: the earliest <code>NotOnOrAfter</code> wins, and a bearer confirmation with
          no <code>NotOnOrAfter</code> (SAML’s profiles require one) is treated as expired.
        </p>
      </Box>
      <Box kind="tip" label="Encrypted assertions">
        <p>
          IdPs can encrypt the assertion to your public key (an <code>EncryptedAssertion</code>). That hides the
          attributes from the browser and its extensions; it does not replace the signature. Decrypt first, then verify
          exactly as here. These projects do not decrypt, so a response carrying an <code>EncryptedAssertion</code> is
          refused.
        </p>
      </Box>

      <Step n={3}>One-time use and the ACS endpoint</Step>
      <div className="prose">
        <p>
          A signed, unexpired assertion can still be a stolen one. Two small stores close that gap, and both need an
          expiry so they do not grow forever:
        </p>
        <ul>
          <li>
            <strong>Pending request IDs.</strong> <code>/saml/login</code> adds the AuthnRequest’s ID for ten minutes. The
            ACS takes it out when the matching response arrives, so each request is answered once. A response that
            answers no request (an IdP-initiated one, or an old one) is refused.
          </li>
          <li>
            <strong>The replay cache.</strong> The ACS records each accepted assertion ID until the assertion expires
            (plus the skew). The same response posted again is refused, even inside its five minutes.
          </li>
        </ul>
        <p>
          “Is it there?” and “remove it” must happen as one step, or two copies of a response posted at the same moment
          both get in. Node.js runs JavaScript on one thread and this handler never awaits, so it gets this for free;
          FastAPI runs plain <code>def</code> endpoints on a pool of threads, so the Python store holds a lock, and the
          .NET one locks too. With Redis, use one atomic command: <code>GETDEL</code> for a pending ID,
          <code> SET … NX</code> for the replay cache.
        </p>
        <p>
          Then the endpoint maps the assertion to a local user. The key is <strong>issuer + NameID</strong>, not the email
          attribute: emails change and are reused, and two IdPs (two customers) can both assert
          <code> ada@example.com</code>. The attributes (<code>email</code>, <code>name</code>, <code>groups</code>)
          refresh the user’s profile at each sign-in. A real app would now start a session (chapter 05) and redirect;
          these projects answer with the user as JSON so you can see the result.
        </p>
      </div>
      <StackFiles
        label="The ACS endpoint and its memory"
        node={[`${T}/node/src/app.ts`, `${T}/node/src/ids.ts`, `${T}/node/src/server.ts`]}
        python={[`${T}/python/app.py`, `${T}/python/ids.py`]}
        dotnet={[`${T}/dotnet/Api/Program.cs`, `${T}/dotnet/Api/ExpiringIds.cs`, `${T}/dotnet/Api/Users.cs`, `${T}/dotnet/Api/Api.csproj`]}
      />
      <Box kind="warn" label="IdP-initiated sign-in">
        <p>
          Entra ID and Okta can also start a sign-in themselves, when a user clicks your app’s tile in their portal. That
          response has no InResponseTo, so nothing ties it to a browser that asked for it: an attacker can post their own
          valid response into a victim’s browser (login CSRF) or replay a captured one. Refuse it, as these projects do,
          or have your ACS answer it by starting a fresh SP-initiated sign-in.
        </p>
      </Box>
      <Box kind="key" label="Tie the request to the browser">
        <p>
          These projects keep pending IDs in server memory, so any browser could finish any pending request. A real app
          also stores the request ID in the user’s session and requires InResponseTo to match <em>that</em> browser’s.
          The IdP posts from another site, and a cookie with <code>SameSite=Lax</code> is not sent on a cross-site POST,
          so that cookie needs <code>SameSite=None; Secure</code> (or use a short-lived cookie just for the round trip).
          With several server instances, keep the pending IDs and the replay cache in Redis or the database.
        </p>
      </Box>

      <Step n={4}>Play the identity provider in the tests</Step>
      <div className="prose">
        <p>
          No test calls a real IdP. Each project has a tiny one: it makes an RSA key and a self-signed certificate at test
          time (Node.js runs the <code>openssl</code> command into a temporary folder it deletes; Python and .NET make them
          in memory), reads the AuthnRequest from the SP’s redirect, and builds and signs a Response the way real IdPs
          do: the assertion signed with an enveloped signature placed after its Issuer, exclusive canonicalization,
          RSA-SHA256, SHA-256 digest. Options change one thing at a time (the issuer, the audience, the recipient, the
          time, the signing key, SHA-1 instead of SHA-256) so each test breaks exactly one rule.
        </p>
      </div>
      <StackFiles
        label="The test identity provider"
        node={`${T}/node/test/idp.ts`}
        python={`${T}/python/fake_idp.py`}
        dotnet={`${T}/dotnet/Api.Tests/TestIdp.cs`}
      />

      <Step n={5}>Run the tests</Step>
      <div className="prose">
        <p>
          The same seventeen tests in each stack: the redirect carries a proper AuthnRequest, the metadata names the
          right URLs, a valid response signs Ada in, and each attack is refused with its error from the table above: another key, the
          right key with SHA-1, a changed attribute, another issuer, the wrong audience, the wrong recipient, an expired
          assertion, one not valid yet, a replay, an answer to a request never sent, two kinds of wrapped assertion
          (beside the signed one, and with the signed one hidden inside the signature), and a DTD with an external
          entity. The last test proves a comment cannot shorten the NameID.
        </p>
      </div>
      <StackFiles
        label="The tests"
        node={[`${T}/node/test/acs.test.ts`, `${T}/node/test/login.test.ts`]}
        python={[`${T}/python/test_acs.py`, `${T}/python/test_login.py`]}
        dotnet={[`${T}/dotnet/Api.Tests/AcsTests.cs`, `${T}/dotnet/Api.Tests/LoginTests.cs`]}
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
          { tag: 'Python', text: '.................        [100%]\n17 passed, 1 warning' },
          { tag: '.NET', text: 'Passed!  - Failed: 0, Passed: 17, Skipped: 0, Total: 17' },
        ]}
      />
      <div className="prose">
        <p>
          The Python warning comes from FastAPI’s test client, which would prefer a newer HTTP library; it does not affect
          the tests. Two small differences between the stacks are worth knowing: signxml also refuses an IdP certificate
          outside its validity dates (xml-crypto and <code>SignedXml</code> check only the signature, as most SPs do,
          because the metadata is the trust anchor), and .NET reads from the original element after proving it is the
          signed one, where the other two read from the signed bytes themselves.
        </p>
      </div>

      <h2>Try it with curl</h2>
      <div className="prose">
        <p>
          A successful sign-in needs a response signed by the IdP’s private key, which is the tests’ job. With curl you
          can still see what the SP publishes and sends, and watch it refuse a forged assertion. The server needs an IdP
          certificate to start, so make a stand-in one first.
        </p>
      </div>
      <Terminal title="A stand-in IdP certificate">{`openssl req -x509 -newkey rsa:2048 -noenc -days 30 -subj "/CN=idp.example.com" \\
  -keyout /tmp/idp.key.pem -out /tmp/idp.crt`}</Terminal>
      <StackTerminal
        title="Start the server on port 3000"
        node={`cd snippets/${T}/node\nIDP_CERT=/tmp/idp.crt npm start`}
        python={`cd snippets/${T}/python\nIDP_CERT=/tmp/idp.crt ../../.venv/bin/python -m uvicorn app:from_env --factory --port 3000`}
        dotnet={`cd snippets/${T}/dotnet\nIDP_CERT=/tmp/idp.crt dotnet run --project Api --urls http://localhost:3000`}
      />
      <Code title="forged.xml: an assertion for admin that nobody signed" lang="xml">{`
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r1" Version="2.0" IssueInstant="2026-10-17T12:00:00Z">
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion ID="_a1" Version="2.0" IssueInstant="2026-10-17T12:00:00Z">
    <saml:Issuer>https://idp.example.com/saml</saml:Issuer>
    <saml:Subject><saml:NameID>admin@example.com</saml:NameID></saml:Subject>
  </saml:Assertion>
</samlp:Response>
`}</Code>
      <Output caption="The same session against each server (all three answer identically; the SAMLRequest changes on every call, shortened here)">{`
$ curl -s localhost:3000/saml/metadata
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/saml/metadata">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/acs" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>
$ curl -s -o /dev/null -w '%{http_code} %{redirect_url}\\n' localhost:3000/saml/login
302 https://idp.example.com/saml/sso?SAMLRequest=fZLRT8IwEMb%2FlaXvYxsgjAZIJsRIgroA%2BuCLOdtDmqzt7HWK…
$ curl -s -X POST localhost:3000/saml/acs
{"error":"Missing SAMLResponse."}
$ curl -s -X POST localhost:3000/saml/acs -d SAMLResponse=bm90IHhtbA==
{"error":"Malformed SAML response."}
$ curl -s -X POST localhost:3000/saml/acs --data-urlencode "SAMLResponse=$(base64 < forged.xml)"
{"error":"Invalid signature."}
`}</Output>
      <div className="prose">
        <p>
          <code>bm90IHhtbA==</code> is Base64 for “not xml”. To read the AuthnRequest the way the IdP does, undo the
          redirect binding: URL-decode, Base64-decode, then raw INFLATE.
        </p>
      </div>
      <Terminal title="Decode the SAMLRequest">{`curl -s -o /dev/null -w '%{redirect_url}' localhost:3000/saml/login | python3 -c 'import sys, zlib, base64, urllib.parse as u; q = u.parse_qs(u.urlsplit(sys.stdin.read()).query); print(zlib.decompress(base64.b64decode(q["SAMLRequest"][0]), -15).decode())'`}</Terminal>
      <Output>{`
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_7dd966783516911c8a6b2392f7c4cb8c1467a83f" Version="2.0" IssueInstant="2026-10-18T04:38:56Z" Destination="https://idp.example.com/saml/sso" AssertionConsumerServiceURL="https://sp.example.com/saml/acs" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>https://sp.example.com/saml/metadata</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/></samlp:AuthnRequest>
`}</Output>

      <h2>In production: use a maintained library</h2>
      <div className="prose">
        <p>
          You have now built every check by hand, which is the best way to understand SAML and to review a library. In a
          real app, use a maintained SAML library: it also handles encrypted assertions, signed requests, single logout,
          metadata refresh and certificate rollover. Configure it strictly, and check that it does what this chapter
          does, InResponseTo and replay included. The blocks below are configuration for Microsoft Entra ID
          (replace <code>{'<tenant-id>'}</code>); they are not run by the tests.
        </p>
      </div>
      <ByStack
        label="Production SAML libraries"
        node={
          <Code title="@node-saml/passport-saml (configuration, not run by the tests)" lang="javascript">{`
import passport from 'passport';
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';

passport.use(new SamlStrategy(
  {
    entryPoint: 'https://login.microsoftonline.com/<tenant-id>/saml2', // the IdP's SSO URL
    issuer: 'https://sp.example.com/saml/metadata', // your entity ID
    callbackUrl: 'https://sp.example.com/saml/acs', // your ACS URL
    idpCert: process.env.IDP_CERT, // the IdP's signing certificate, from its metadata
    audience: 'https://sp.example.com/saml/metadata',
    wantAssertionsSigned: true,
    acceptedClockSkewMs: 60_000,
    validateInResponseTo: 'always', // the default is 'never'
    // cacheProvider: a shared store (Redis) for request IDs when you run several instances
  },
  (profile, done) => done(null, { nameId: profile.nameID, email: profile.email }), // sign-in
  (profile, done) => done(null, { nameId: profile.nameID }), // single logout
));
`}</Code>
        }
        python={
          <Code title="python3-saml (configuration, not run by the tests)" lang="python">{`
from onelogin.saml2.auth import OneLogin_Saml2_Auth

SETTINGS = {
    "strict": True,  # refuse anything unsigned, expired or for someone else: never turn this off
    "sp": {
        "entityId": "https://sp.example.com/saml/metadata",
        "assertionConsumerService": {
            "url": "https://sp.example.com/saml/acs",
            "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
        },
    },
    "idp": {
        "entityId": "https://sts.windows.net/<tenant-id>/",
        "singleSignOnService": {
            "url": "https://login.microsoftonline.com/<tenant-id>/saml2",
            "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
        },
        "x509cert": IDP_CERT,  # the IdP's signing certificate, from its metadata
    },
    "security": {"wantAssertionsSigned": True, "rejectDeprecatedAlgorithm": True},
}

# In the ACS handler. request_data describes the request: https, http_host, script_name, post_data.
auth = OneLogin_Saml2_Auth(request_data, SETTINGS)
auth.process_response(request_id=pending_request_id)  # the AuthnRequest ID you stored for this browser
if auth.get_errors() or not auth.is_authenticated():
    ...  # 401
user = auth.get_nameid(), auth.get_attributes()
# Replay protection is yours to add: remember auth.get_last_assertion_id() until it expires.
`}</Code>
        }
        dotnet={
          <Code title="Sustainsys.Saml2 for ASP.NET Core (configuration, not run by the tests)" lang="csharp">{`
using Microsoft.AspNetCore.Authentication.Cookies;
using Sustainsys.Saml2;
using Sustainsys.Saml2.AspNetCore2;
using Sustainsys.Saml2.Metadata;

builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = Saml2Defaults.Scheme;
    })
    .AddCookie()
    .AddSaml2(options =>
    {
        options.SPOptions.EntityId = new EntityId("https://sp.example.com/saml/metadata");
        // Loads the SSO URL and signing certificate from the IdP's metadata, and refreshes them.
        options.IdentityProviders.Add(new IdentityProvider(
            new EntityId("https://sts.windows.net/<tenant-id>/"), options.SPOptions)
        {
            MetadataLocation = "https://login.microsoftonline.com/<tenant-id>/federationmetadata/2007-06/federationmetadata.xml",
            LoadMetadata = true,
        });
    });
// ITfoxtec.Identity.Saml2 is the other common choice: lower level, closer to the code in this chapter.
`}</Code>
        }
      />
      <div className="prose">
        <p>
          Other good options: <strong>pysaml2</strong> (Python, more complete and more complex than python3-saml), and
          <strong> ITfoxtec.Identity.Saml2</strong> (.NET). Or keep SAML out of your app entirely: an identity broker
          (Keycloak, Auth0, Microsoft Entra External ID, and others) can speak SAML to each customer’s IdP while your
          app speaks only OpenID Connect to the broker.
        </p>
      </div>

      <h2>SAML or OpenID Connect?</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>SAML 2.0</th><th>OpenID Connect (chapter 12)</th></tr>
        </thead>
        <tbody>
          <tr><td>Format</td><td>XML assertion, XML Signature</td><td>JSON ID token (a JWT), JWS signature</td></tr>
          <tr><td>How it travels</td><td>Browser redirect out, auto-submitted form back</td><td>Browser redirect out, code back, then a server-to-server token request</td></tr>
          <tr><td>Hard part</td><td>XML canonicalization, signature wrapping</td><td>Validating the ID token, state and nonce, PKCE</td></tr>
          <tr><td>Mobile apps and APIs</td><td>Poor: built for browsers, no access tokens</td><td>Good: pairs with OAuth 2.0 access tokens</td></tr>
          <tr><td>Who asks for it</td><td>Enterprise IT, older IdPs, government and education federations</td><td>Almost everyone building something new</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Choose OpenID Connect for anything new, including your own sign-in with Entra ID, Google or Okta. Add SAML when
          customers need it, which in business software is often: many corporate IdPs are configured for SAML, and some
          federations (universities, public sector) speak only SAML. Supporting both through one library or broker is
          normal.
        </p>
      </div>

      <h2>Mistakes to avoid</h2>
      <TableWrap>
        <thead>
          <tr><th>Mistake</th><th>Why it hurts</th><th>Do this instead</th></tr>
        </thead>
        <tbody>
          <tr><td>Verifying with the certificate in <code>KeyInfo</code></td><td>Anyone can sign with their own key and include their certificate</td><td>Verify only with the IdP’s certificate from metadata</td></tr>
          <tr><td>Checking “a signature is valid”, then reading the first assertion</td><td>Signature wrapping: a forged assertion beside a genuine one</td><td>Read only what the signature covers; require exactly one assertion</td></tr>
          <tr><td>Reading the NameID’s first text node</td><td>A comment cuts <code>ada@example.com.evil.example</code> down to Ada</td><td>Read the whole text of the signed element</td></tr>
          <tr><td>Skipping Audience or Recipient</td><td>An assertion meant for another app at the same IdP signs in to yours</td><td>Check both against your configured values</td></tr>
          <tr><td>No InResponseTo check or replay cache</td><td>Captured or unsolicited responses work for their whole lifetime</td><td>Pending request IDs and a shared replay cache</td></tr>
          <tr><td>Parsing with DTDs enabled</td><td>XXE reads server files; entity expansion exhausts memory</td><td>Prohibit DTDs, as the three parsers here do</td></tr>
          <tr><td>Accepting any algorithm</td><td>SHA-1 signatures and odd transforms widen the attack surface</td><td>Allow RSA-SHA256 (or stronger) and the expected transforms only</td></tr>
          <tr><td>Keying users by the email attribute</td><td>Emails change; another customer’s IdP can assert the same email</td><td>Key by issuer + NameID (a persistent NameID is best)</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="An attacker builds a Response, signs it with their own key and puts their own certificate in the signature’s KeyInfo. Every condition is right. Why does your SP refuse it?">
        <p>
          Because the SP verifies with the IdP’s certificate from its settings (from the IdP’s metadata), never with the
          certificate in the message. The attacker’s signature does not verify with the IdP’s public key, so the answer
          is “Invalid signature.” The test “a response signed with another key is refused” does exactly this.
        </p>
      </Checkpoint>
      <Checkpoint question="A response’s signature verifies, yet a naive SP signs the user in as admin@example.com while the IdP signed mallory@example.com. What happened, and which two rules stop it?">
        <p>
          Signature wrapping. The attacker kept Mallory’s genuine signed assertion in the document (so a signature still
          verifies) and added a forged, unsigned assertion for admin where the naive SP looks first. Stop it by
          refusing any response that does not contain exactly one assertion, and by reading the user only from the
          element the signature covers, never from the document at large.
        </p>
      </Checkpoint>
      <Checkpoint question="Why check InResponseTo and keep a replay cache, when every assertion already expires after five minutes?">
        <p>
          Five minutes is plenty for an attacker who captured a response (from a log, a proxy, a browser extension) to
          post it again. The replay cache makes each assertion work once. InResponseTo ties the response to a request
          your app actually sent, which refuses unsolicited responses and, when the request ID is also kept in the
          user’s session, a response started in someone else’s browser.
        </p>
      </Checkpoint>

      <Exercises
        items={[
          {
            task: (
              <>
                In <code>projects/{T}</code>, rebuild the project in your stack, then add <code>RelayState</code>:
                <code> /saml/login?returnTo=/reports</code> sends the user back to <code>/reports</code> after signing in.
              </>
            ),
            hint: <>Store <code>returnTo</code> with the pending request ID instead of trusting the echoed RelayState, and allow only local paths: starting with <code>/</code> but not <code>//</code> or <code>/\</code>, or it becomes an open redirect.</>,
          },
          {
            task: <>Tie each request to the browser: set a short-lived cookie with the request ID at <code>/saml/login</code>, and require InResponseTo to match it at the ACS.</>,
            hint: <>The IdP’s form post is cross-site, so the cookie needs <code>SameSite=None; Secure; HttpOnly</code> and a <code>Max-Age</code> of about ten minutes. Clear it after use. Write a test where another browser’s cookie is refused.</>,
          },
          {
            task: <>Support IdP certificate rollover: trust two certificates for a while (the current one and the next, both from metadata), and add a test that each verifies.</>,
            hint: <>Try each trusted certificate in turn and accept the first that verifies. Never fall back to the certificate in the message.</>,
          },
          {
            task: <>Sign your AuthnRequests and publish your signing certificate in the metadata with <code>AuthnRequestsSigned="true"</code>.</>,
            hint: <>For HTTP-Redirect, the signature is not inside the XML: sign the bytes of <code>SAMLRequest=…&amp;RelayState=…&amp;SigAlg=…</code> exactly as they appear URL-encoded, and add <code>SigAlg</code> and <code>Signature</code> query parameters (SAML Bindings, section 3.4.4.1).</>,
          },
        ]}
      />

      <Recap>
        <ul>
          <li>SP-initiated SSO: an AuthnRequest goes out by redirect (deflated, Base64), and a signed Response comes back by form post to your ACS.</li>
          <li>Verify the signature with the IdP’s certificate from metadata, never from the message, and allow only the algorithms you expect.</li>
          <li>See what is signed: exactly one assertion, the signature’s one reference is that assertion, and you read only from it.</li>
          <li>Then check Issuer, Recipient and Destination, every Audience, the time window with a little skew, InResponseTo, and one-time use.</li>
          <li>Key users by issuer + NameID; prefer OpenID Connect for new work, and use a maintained library or broker for SAML in production.</li>
        </ul>
      </Recap>
    </>
  );
}
