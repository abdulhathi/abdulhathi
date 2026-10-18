import type { ReactNode } from 'react';
import { Box, Checkpoint, Recap, TableWrap } from '../components/Content';
import { hrefFor } from '../lib/route';

const Ch = ({ id, children }: { id: string; children: ReactNode }) => <a href={hrefFor(id)}>{children}</a>;

type Method = {
  id: string;
  name: string;
  proves: string;
  bestFor: string;
  avoid: string;
  node: string;
  python: string;
  dotnet: string;
};

const METHODS: Method[] = [
  {
    id: 'passwords', name: 'Password', proves: 'Something the user knows, checked against a slow salted hash',
    bestFor: 'The first sign-in for most consumer and business apps', avoid: 'As the only factor for admins or sensitive data',
    node: 'node:crypto scrypt, argon2', python: 'argon2-cffi, bcrypt', dotnet: 'Identity PasswordHasher, Konscious Argon2',
  },
  {
    id: 'sessions', name: 'Session cookie', proves: 'A random session id the server looks up, in an HttpOnly cookie',
    bestFor: 'Server-rendered apps, and SPAs talking to their own backend (BFF)', avoid: 'Third-party APIs and mobile clients',
    node: 'express-session', python: 'a session store dependency; Starlette SessionMiddleware (signed)', dotnet: 'Cookie authentication',
  },
  {
    id: 'basic-auth', name: 'HTTP Basic', proves: 'User name and password sent with every request (Base64, not encrypted)',
    bestFor: 'Internal tools and simple machine clients, over TLS only', avoid: 'Anything a browser user signs out of',
    node: 'a small middleware', python: 'fastapi.security.HTTPBasic', dotnet: 'a custom AuthenticationHandler',
  },
  {
    id: 'api-keys', name: 'API key', proves: 'A long random secret that identifies a calling application',
    bestFor: 'Server-to-server and developer APIs, with scopes and rate limits', avoid: 'Identifying a person; browser code (it leaks)',
    node: 'node:crypto + middleware', python: 'secrets + a dependency', dotnet: 'a custom AuthenticationHandler + policies',
  },
  {
    id: 'jwt', name: 'JWT bearer token', proves: 'A signed, self-contained set of claims checked without a database lookup',
    bestFor: 'APIs and microservices verifying a token from one issuer', avoid: 'Long-lived tokens you might need to revoke at once',
    node: 'jose', python: 'PyJWT', dotnet: 'JwtBearer, Microsoft.IdentityModel',
  },
  {
    id: 'refresh-tokens', name: 'Refresh token', proves: 'A long-lived, rotating, revocable token that buys new short access tokens',
    bestFor: 'Keeping users signed in without long-lived access tokens', avoid: 'Storing it where page scripts can read it',
    node: 'jose + a token store', python: 'PyJWT + a token store', dotnet: 'JwtBearer + a token store',
  },
  {
    id: 'hmac', name: 'HMAC request signature', proves: 'The sender holds a shared secret, and the body was not changed',
    bestFor: 'Webhooks, and request signing between partners', avoid: 'Browser clients (they cannot keep the secret)',
    node: 'node:crypto createHmac', python: 'hmac, hashlib', dotnet: 'HMACSHA256',
  },
  {
    id: 'oauth2', name: 'OAuth 2.0', proves: 'Delegated access: an app gets a scoped token to act for a user or itself',
    bestFor: 'Third-party access to your API; service-to-service (client credentials)', avoid: 'Using a bare access token as proof of sign-in',
    node: 'openid-client, oauth4webapi', python: 'Authlib', dotnet: 'OpenIddict, Duende IdentityServer, JwtBearer',
  },
  {
    id: 'oidc', name: 'OpenID Connect', proves: 'An identity provider signs an ID token that says who the user is',
    bestFor: '“Sign in with Microsoft, Google, Okta…” and enterprise SSO', avoid: 'Skipping ID-token validation (nonce, aud, iss)',
    node: 'openid-client', python: 'Authlib', dotnet: 'AddOpenIdConnect, Microsoft.Identity.Web',
  },
  {
    id: 'saml', name: 'SAML 2.0', proves: 'An identity provider signs an XML assertion about the user',
    bestFor: 'Enterprise SSO where the customer’s IdP prefers SAML', avoid: 'New consumer apps (prefer OIDC)',
    node: '@node-saml/passport-saml, xml-crypto', python: 'python3-saml, pysaml2, signxml', dotnet: 'Sustainsys.Saml2, ITfoxtec, SignedXml',
  },
  {
    id: 'mfa', name: 'TOTP codes (MFA)', proves: 'Something the user has: a code from an authenticator app',
    bestFor: 'A second factor after a password', avoid: 'As phishing protection on its own (codes can be relayed)',
    node: 'otpauth', python: 'pyotp', dotnet: 'Otp.NET',
  },
  {
    id: 'passkeys', name: 'Passkeys (WebAuthn)', proves: 'A device signs a challenge with a private key bound to your site',
    bestFor: 'Phishing-resistant sign-in, with or without a password', avoid: 'Assuming every user has a passkey yet (keep a fallback)',
    node: '@simplewebauthn/server', python: 'webauthn (py_webauthn)', dotnet: 'Fido2NetLib',
  },
  {
    id: 'magic-links', name: 'Magic link / email code', proves: 'Control of an email inbox, via a single-use short-lived token',
    bestFor: 'Low-friction consumer sign-in and account recovery', avoid: 'High-value accounts as the only factor',
    node: 'node:crypto + a mailer', python: 'secrets + a mailer', dotnet: 'RandomNumberGenerator + a mailer',
  },
  {
    id: 'mtls', name: 'Mutual TLS', proves: 'The client holds a private key for a certificate your CA issued',
    bestFor: 'Service meshes, B2B and banking APIs, devices', avoid: 'Ordinary browser users',
    node: 'node:https requestCert', python: 'ssl.SSLContext (CERT_REQUIRED)', dotnet: 'Kestrel + Certificate authentication',
  },
];

export function Methods() {
  return (
    <>
      <div className="prose">
        <p>
          <strong>Authentication</strong> answers “who is making this request?”. <strong>Authorization</strong>, covered
          in <Ch id="authorization">chapter 18</Ch>, answers “may they do this?”. This page lists every common way to do
          the first, so you can pick the right one before you write code. Each row links to a chapter that builds it in
          Node.js, Python and .NET.
        </p>
        <p>
          Every method proves identity with one of three kinds of <strong>factor</strong>: something you{' '}
          <em>know</em> (a password), something you <em>have</em> (a phone with an authenticator app, a passkey, a
          private key, an email inbox), or something you <em>are</em> (a fingerprint, which in practice unlocks a
          “have” factor such as a passkey). <strong>Multi-factor authentication</strong> combines two different kinds.
        </p>
      </div>

      <h2>The full list</h2>
      <TableWrap className="t methods">
        <thead>
          <tr><th>Method</th><th>What it proves</th><th>Best for</th><th>Avoid for</th><th>Node.js</th><th>Python</th><th>.NET</th></tr>
        </thead>
        <tbody>
          {METHODS.map((m) => (
            <tr key={m.id}>
              <td><Ch id={m.id}>{m.name}</Ch></td>
              <td>{m.proves}</td>
              <td>{m.bestFor}</td>
              <td>{m.avoid}</td>
              <td>{m.node}</td>
              <td>{m.python}</td>
              <td>{m.dotnet}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <h2>Which one should I use?</h2>
      <div className="prose">
        <p>Real systems combine methods. These are the usual answers for common situations:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Situation</th><th>Usual answer</th><th>Chapters</th></tr>
        </thead>
        <tbody>
          <tr><td>A web app with its own backend</td><td>Password (plus a passkey or TOTP), then a session cookie</td><td><Ch id="passwords">04</Ch>, <Ch id="sessions">05</Ch>, <Ch id="passkeys">15</Ch></td></tr>
          <tr><td>A single-page app calling your API</td><td>A backend-for-frontend that holds tokens server-side and gives the browser a session cookie</td><td><Ch id="sessions">05</Ch>, <Ch id="refresh-tokens">09</Ch>, <Ch id="oidc">12</Ch></td></tr>
          <tr><td>“Sign in with Microsoft / Google / Okta”</td><td>OpenID Connect, authorization code flow with PKCE</td><td><Ch id="oauth2">11</Ch>, <Ch id="oidc">12</Ch></td></tr>
          <tr><td>A business customer wants their own SSO</td><td>OIDC if their IdP supports it, SAML 2.0 otherwise</td><td><Ch id="oidc">12</Ch>, <Ch id="saml">13</Ch></td></tr>
          <tr><td>A mobile app</td><td>OIDC code flow with PKCE in the system browser, short access tokens, rotating refresh tokens</td><td><Ch id="oauth2">11</Ch>, <Ch id="refresh-tokens">09</Ch></td></tr>
          <tr><td>An API used by microservices</td><td>JWT access tokens from one issuer, verified with its JWKS</td><td><Ch id="jwt">08</Ch></td></tr>
          <tr><td>Service-to-service calls</td><td>OAuth client credentials, or mutual TLS inside a mesh; API keys for simple cases</td><td><Ch id="oauth2">11</Ch>, <Ch id="mtls">17</Ch>, <Ch id="api-keys">07</Ch></td></tr>
          <tr><td>Receiving webhooks</td><td>HMAC signatures with a timestamp</td><td><Ch id="hmac">10</Ch></td></tr>
          <tr><td>Developers calling your public API</td><td>API keys with scopes and rate limits, or OAuth for user data</td><td><Ch id="api-keys">07</Ch>, <Ch id="oauth2">11</Ch></td></tr>
          <tr><td>The lowest-friction consumer sign-in</td><td>Passkeys first, magic links or email codes as a fallback</td><td><Ch id="passkeys">15</Ch>, <Ch id="magic-links">16</Ch></td></tr>
          <tr><td>Internal admin tools</td><td>Company SSO (OIDC or SAML) plus MFA; Basic over TLS only for quick internal endpoints</td><td><Ch id="oidc">12</Ch>, <Ch id="mfa">14</Ch>, <Ch id="basic-auth">06</Ch></td></tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Two ideas that run through every chapter">
        <ul>
          <li>
            <strong>A credential is only as safe as where it lives.</strong> Passwords as slow hashes, API keys and
            refresh tokens as fast hashes, private keys in a key vault, browser tokens in HttpOnly cookies rather than
            where page scripts can read them.
          </li>
          <li>
            <strong>Verify everything, every time.</strong> Signatures, issuers, audiences, expiry, single use and
            ownership. Most real breaches are not broken cryptography; they are a check someone skipped.
          </li>
        </ul>
      </Box>

      <h2>Session or token?</h2>
      <div className="prose">
        <p>
          After the first sign-in, the server needs to recognize the user on every later request. There are two families
          of answer, and most of the lab is one or the other:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Session (stateful)</th><th>Self-contained token (stateless)</th></tr>
        </thead>
        <tbody>
          <tr><td>What the client holds</td><td>A random id in a cookie</td><td>A signed token, such as a JWT</td></tr>
          <tr><td>What the server checks</td><td>Looks the id up in a session store</td><td>Checks the signature and claims; no lookup</td></tr>
          <tr><td>Sign-out and revocation</td><td>Instant: delete the session</td><td>Hard: wait for expiry, or keep a deny-list</td></tr>
          <tr><td>Scaling across services</td><td>Every service needs the shared store</td><td>Any service with the public key can verify</td></tr>
          <tr><td>Typical use</td><td>Browser apps and BFFs</td><td>APIs, microservices, mobile clients</td></tr>
        </tbody>
      </TableWrap>

      <Checkpoint question="A partner company wants to call your API from their servers every night. Which method fits, and why not a user’s password?">
        <p>
          OAuth 2.0 client credentials (a client id and secret exchanged for a short-lived, scoped access token), or an
          API key with scopes for a simpler setup, or mutual TLS if both sides run a certificate authority. Not a user’s
          password: the calls are made by a system, not a person; a password would need to be stored in plain text on
          their side, and it would break when the person leaves or changes it.
        </p>
      </Checkpoint>
      <Checkpoint question="Is TOTP enough to stop phishing?">
        <p>
          No. A fake sign-in page can ask for the code and relay it to the real site within the 30-second window. TOTP
          stops password reuse and credential stuffing; passkeys stop phishing, because the browser will only sign for
          the real site’s origin.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Authentication proves who is calling; authorization decides what they may do.</li>
          <li>Pick the method by who the client is (a person in a browser, a mobile app, a server, a webhook sender) and what is at stake.</li>
          <li>Most systems combine methods: a first factor, a second factor, then a session or a token for later requests.</li>
        </ul>
      </Recap>
    </>
  );
}
