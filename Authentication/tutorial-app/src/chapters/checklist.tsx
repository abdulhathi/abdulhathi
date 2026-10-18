import type { ReactNode } from 'react';
import { Box, Recap, TableWrap } from '../components/Content';
import { hrefFor } from '../lib/route';

const Ch = ({ id, children }: { id: string; children: ReactNode }) => <a href={hrefFor(id)}>{children}</a>;

const ATTACKS: [string, string, ReactNode][] = [
  ['Credential stuffing', 'Trying email and password pairs leaked from other sites', <>Breached-password checks, rate limits per account and IP, MFA, passkeys (<Ch id="passwords">04</Ch>, <Ch id="mfa">14</Ch>)</>],
  ['Brute force and password spraying', 'Many guesses at one account, or one common password across many accounts', <>Slow hashes, failure counters per account and per IP, progressive delays (<Ch id="passwords">04</Ch>)</>],
  ['Phishing', 'A look-alike page collects the password and the one-time code', <>Passkeys, which only sign for the real origin (<Ch id="passkeys">15</Ch>)</>],
  ['Account enumeration', 'Different answers reveal which emails have accounts', <>One message, one status and similar timing for every failure (<Ch id="passwords">04</Ch>, <Ch id="magic-links">16</Ch>)</>],
  ['Session hijacking', 'Stealing a session cookie or token, often through XSS', <>HttpOnly cookies, a strict CSP, output encoding, short lifetimes (<Ch id="sessions">05</Ch>)</>],
  ['Session fixation', 'The attacker plants a session id, then waits for the victim to sign in with it', <>A new session id at every sign-in (<Ch id="sessions">05</Ch>)</>],
  ['Cross-site request forgery', 'Another site makes the browser send a request with your cookie', <>SameSite cookies plus a CSRF token for state-changing requests (<Ch id="sessions">05</Ch>)</>],
  ['Token leakage', 'Tokens in URLs, logs, Referer headers or localStorage', <>Tokens in headers or HttpOnly cookies, never in URLs; redact logs (<Ch id="jwt">08</Ch>, <Ch id="refresh-tokens">09</Ch>)</>],
  ['JWT algorithm confusion', 'A token signed with "none", or HS256 using the public key as the secret', <>An allowlist of algorithms and keys chosen by the server (<Ch id="jwt">08</Ch>)</>],
  ['Refresh-token theft', 'A stolen refresh token keeps working for weeks', <>Rotation with reuse detection, revocation on sign-out (<Ch id="refresh-tokens">09</Ch>)</>],
  ['Authorization-code interception', 'A malicious app or log captures the code from the redirect', <>PKCE with S256, exact redirect-URI matching, single-use codes (<Ch id="oauth2">11</Ch>)</>],
  ['OAuth CSRF and mix-up', 'The attacker’s code is injected into the victim’s browser', <>The state parameter, and the nonce in OIDC (<Ch id="oauth2">11</Ch>, <Ch id="oidc">12</Ch>)</>],
  ['Open redirect', 'A sign-in flow that redirects to any URL sends victims to the attacker', <>Allowlisted, exactly matched redirect targets (<Ch id="oauth2">11</Ch>)</>],
  ['Replay', 'A captured webhook, assertion or code is sent again', <>Timestamps, single-use ids and replay caches (<Ch id="hmac">10</Ch>, <Ch id="saml">13</Ch>)</>],
  ['XML signature wrapping', 'A signed SAML assertion is moved, and an unsigned one is read instead', <>Read only the element the signature covers (<Ch id="saml">13</Ch>)</>],
  ['Timing attacks', 'Response time reveals how much of a secret matched', <>Constant-time comparison of secrets, hashes and signatures (<Ch id="api-keys">07</Ch>, <Ch id="hmac">10</Ch>)</>],
  ['MFA fatigue and SIM swap', 'Repeated push prompts until the user taps approve; a phone number moved to the attacker’s SIM', <>Number matching, rate limits, passkeys or TOTP instead of SMS (<Ch id="mfa">14</Ch>)</>],
  ['Weak account recovery', 'The password-reset or email-change flow skips the protections sign-in has', <>Single-use, short-lived reset tokens; re-authentication for sensitive changes; notify the user (<Ch id="magic-links">16</Ch>)</>],
  ['Broken object level authorization', 'A signed-in user reads another user’s record by changing an id', <>Ownership and tenant checks on every object (<Ch id="authorization">18</Ch>)</>],
];

const CHECKLIST: [string, string[]][] = [
  ['Storing credentials', [
    'Passwords: Argon2id, scrypt, bcrypt or PBKDF2 with OWASP settings, a per-hash salt, and rehash on sign-in.',
    'API keys, refresh tokens, reset and magic-link tokens: only a SHA-256 hash is stored.',
    'Signing keys and client secrets live in a key vault or secret manager, never in the repository.',
    'TOTP secrets are encrypted at rest; recovery codes are hashed and single-use.',
  ]],
  ['Transport', [
    'HTTPS everywhere, with HSTS; no credentials over plain HTTP, even internally.',
    'Credentials and tokens never go in URLs or query strings.',
  ]],
  ['Sessions and cookies', [
    'Session ids are random (at least 128 bits) and replaced at sign-in.',
    'Cookies are HttpOnly, Secure and SameSite=Lax or Strict, with a narrow Path.',
    'Idle and absolute timeouts; sign-out deletes the server-side session.',
    'State-changing requests are protected against CSRF.',
  ]],
  ['Tokens', [
    'Access tokens live minutes, not days; refresh tokens rotate and detect reuse.',
    'JWTs are verified with an algorithm allowlist, issuer, audience, expiry and the right key.',
    'Browser apps keep tokens server-side (BFF) or in memory, not in localStorage.',
  ]],
  ['Federation (OAuth, OIDC, SAML)', [
    'Authorization code with PKCE; no implicit or password grant.',
    'state and nonce are checked; redirect URIs match exactly.',
    'ID tokens and SAML assertions are fully validated, and assertion ids are single-use.',
  ]],
  ['Sign-in experience', [
    'One message for every failure; similar timing for known and unknown accounts.',
    'Rate limits and lockouts per account and per IP, designed so they cannot be used to lock users out at will.',
    'MFA available for everyone and required for admins; passkeys offered.',
    'Recovery and email-change flows are as strong as sign-in and notify the user.',
  ]],
  ['Operations', [
    'Sign-ins, failures, lockouts, MFA changes and token reuse are logged, without passwords or tokens in the logs.',
    'Alerts on bursts of failures, impossible travel and refresh-token reuse.',
    'Keys can be rotated without downtime (JWKS with several keys, several webhook secrets).',
    'Dependencies for authentication libraries are kept up to date.',
  ]],
];

export function Checklist() {
  return (
    <>
      <div className="prose">
        <p>
          Every attack below has been used against real systems at scale. The defenses are the ones the chapters build;
          the links take you to where each is implemented and tested.
        </p>
      </div>

      <h2>Common attacks and their defenses</h2>
      <TableWrap>
        <thead>
          <tr><th>Attack</th><th>How it works</th><th>Defense</th></tr>
        </thead>
        <tbody>
          {ATTACKS.map(([name, how, defense]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{how}</td>
              <td>{defense}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <h2>The checklist</h2>
      <div className="prose">
        <p>Use it before a release, in a design review, or to answer “how would you secure sign-in?” in an interview.</p>
      </div>
      {CHECKLIST.map(([group, items]) => (
        <section key={group} aria-label={group}>
          <h3>{group}</h3>
          <ul className="prose">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <Box kind="key" label="Where to read more">
        <p>
          OWASP Authentication, Password Storage, Session Management and Cross-Site Request Forgery Prevention cheat
          sheets; NIST SP 800-63B (digital identity guidelines); RFC 9700 (OAuth 2.0 security best current practice);
          OWASP API Security Top 10.
        </p>
      </Box>

      <Recap>
        <ul>
          <li>Most authentication breaches come from skipped checks and leaked credentials, not broken cryptography.</li>
          <li>Store secrets as hashes or in a vault, move them only over TLS and never in URLs, and keep their lifetimes short.</li>
          <li>Design the failure paths (enumeration, lockout, recovery) as carefully as the happy path.</li>
        </ul>
      </Recap>
    </>
  );
}
