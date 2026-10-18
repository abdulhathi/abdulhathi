import type { ReactNode } from 'react';
import { Checkpoint } from '../components/Content';
import { hrefFor } from '../lib/route';

const Ch = ({ id, children }: { id: string; children: ReactNode }) => <a href={hrefFor(id)}>{children}</a>;

const QUESTIONS: [string, string, ReactNode][] = [
  ['Basics', 'What is the difference between authentication and authorization, and which status codes go with each?', <>Authentication establishes who is calling; authorization decides whether that caller may do this. A missing or invalid credential is 401 Unauthorized (despite the name, it means unauthenticated) with a WWW-Authenticate header; a valid caller without permission is 403 Forbidden, or 404 when you do not want to reveal that the object exists.</>],
  ['Basics', 'Sessions or tokens: which would you choose for a web app?', <>For a browser app with its own backend, a server-side session in an HttpOnly, Secure, SameSite cookie: instant revocation, nothing readable by scripts. Tokens fit APIs called by many clients and services. Many SPAs use a backend-for-frontend: the BFF holds OAuth tokens server-side and gives the browser a session cookie. See <Ch id="sessions">chapter 05</Ch>.</>],
  ['Passwords', 'How should passwords be stored?', <>As a slow, salted, memory-hard hash: Argon2id (19 MiB, 2 iterations), or scrypt, bcrypt (cost 10+, note the 72-byte limit) or PBKDF2 (600,000 iterations with SHA-256). Keep the algorithm and parameters in the stored string, compare in constant time, and rehash at sign-in when settings rise. Optionally add a pepper kept in a vault. See <Ch id="passwords">chapter 04</Ch>.</>],
  ['Passwords', 'Why not SHA-256 with a salt?', <>Because SHA-256 is fast: a GPU computes billions per second, so a salted SHA-256 database still falls to dictionary attacks quickly. Password hashing functions are deliberately slow and, for Argon2id and scrypt, memory-hard, which removes most of the GPU advantage.</>],
  ['Passwords', 'How do you stop account enumeration on sign-in?', <>Return the same status and message for an unknown email and a wrong password, and make both take the same time by verifying against a dummy hash when the user is not found. Apply the same thinking to sign-up and password reset.</>],
  ['Sessions', 'What is session fixation, and how do you prevent it?', <>An attacker gets a victim to use a session id the attacker knows, then waits for them to sign in so the id becomes authenticated. Prevent it by issuing a new session id at sign-in (and at any privilege change) and discarding the old one.</>],
  ['Sessions', 'How does CSRF work, and what stops it?', <>Another site makes the victim’s browser send a request to your site, and the browser attaches your cookie. SameSite=Lax or Strict cookies stop most cases; for state-changing requests add a CSRF token (synchronizer or double-submit) checked server-side, and require a non-simple content type for JSON APIs.</>],
  ['Tokens', 'What is inside a JWT, and how do you validate one?', <>A Base64URL header (alg, kid), a payload of claims (iss, sub, aud, exp, nbf, iat, jti, plus your own) and a signature. Validate the signature with a key you chose (by kid from your issuer’s JWKS), with an allowlist of algorithms, then iss, aud, exp and nbf with a little clock skew, and any required claims. The payload is readable by anyone: never put secrets in it. See <Ch id="jwt">chapter 08</Ch>.</>],
  ['Tokens', 'What are the classic JWT mistakes?', <>Accepting alg "none"; algorithm confusion (verifying an HS256 token with the RSA public key as the secret); not checking aud or iss; long lifetimes with no way to revoke; secrets in the payload; tokens in localStorage or URLs; trusting the kid or jku header to fetch keys from anywhere.</>],
  ['Tokens', 'How should refresh tokens work?', <>Opaque, random, stored only as a hash, bound to a client and a family; rotated on every use; reusing an old one revokes the whole family (it means theft); revoked on sign-out; with an absolute lifetime. In a browser, keep it in an HttpOnly cookie scoped to the refresh endpoint, or keep it server-side in a BFF. See <Ch id="refresh-tokens">chapter 09</Ch>.</>],
  ['Tokens', 'How do you revoke a JWT before it expires?', <>You cannot make it stop verifying. Keep access tokens short (minutes) and revoke the refresh token, or check a deny-list of jti values (which reintroduces a lookup), or use opaque tokens with introspection when instant revocation matters.</>],
  ['APIs', 'When is an API key acceptable, and how do you store it?', <>For identifying an application (server-to-server, developer APIs), with scopes, expiry, rate limits and rotation; not for identifying a person, and never in browser code. Store only a SHA-256 hash (fine for high-entropy random keys), look it up by a key id prefix, compare in constant time, show the key once. See <Ch id="api-keys">chapter 07</Ch>.</>],
  ['APIs', 'How do you verify a webhook?', <>Recompute an HMAC-SHA256 over the timestamp and the raw body with the shared secret, compare it in constant time with the signature header, reject old timestamps (a few minutes), optionally remember signatures to block replays, and accept several secrets during rotation. See <Ch id="hmac">chapter 10</Ch>.</>],
  ['OAuth and OIDC', 'Walk me through the authorization code flow with PKCE.', <>The client makes a random code_verifier and sends its SHA-256 (code_challenge, S256) with state to /authorize. The user signs in at the authorization server, which redirects back with a short-lived code and the state. The client checks state and posts the code plus the code_verifier to /token; the server checks that the verifier hashes to the challenge, the redirect URI matches and the code is unused, then returns tokens. PKCE stops a stolen code from being redeemed. See <Ch id="oauth2">chapter 11</Ch>.</>],
  ['OAuth and OIDC', 'What is the difference between OAuth 2.0 and OpenID Connect?', <>OAuth 2.0 is delegated authorization: it gives a client an access token to call an API. It does not tell the client who the user is. OpenID Connect adds identity on top: an ID token (a JWT for the client, with iss, sub, aud, nonce), discovery, JWKS and a UserInfo endpoint. Use OIDC for sign-in. See <Ch id="oidc">chapter 12</Ch>.</>],
  ['OAuth and OIDC', 'What is the difference between an ID token and an access token?', <>The ID token is for the client: it proves who signed in and must be validated by the client (aud is the client id). The access token is for the API: the client should treat it as opaque and send it as a bearer token; the API validates it (aud is the API).</>],
  ['OAuth and OIDC', 'Which OAuth grants should you no longer use?', <>The implicit grant (tokens in the URL fragment) and the resource owner password grant; RFC 9700 and OAuth 2.1 drop both. Use the authorization code flow with PKCE for every client that acts for a user, and client credentials for machine-to-machine.</>],
  ['SAML', 'What must a SAML service provider validate?', <>The XML signature with the IdP’s certificate over the element it actually reads (to defeat signature wrapping), the Issuer, the AudienceRestriction, Recipient and Destination, NotBefore and NotOnOrAfter with small skew, InResponseTo for SP-initiated flows, and that the assertion id has not been used before. See <Ch id="saml">chapter 13</Ch>.</>],
  ['SAML', 'A customer’s IdP supports both SAML and OIDC. Which do you integrate?', <>OIDC, usually: JSON and JWTs instead of XML signatures, better library support, works for mobile and SPAs, and fewer classic vulnerabilities. Choose SAML when the customer requires it or their IdP’s OIDC support is incomplete.</>],
  ['MFA and passwordless', 'Is TOTP phishing-resistant? What is?', <>No: a fake page can relay the code within its time window. Passkeys (WebAuthn) are phishing-resistant because the browser binds each signature to the real origin and the private key never leaves the device. See <Ch id="mfa">chapter 14</Ch> and <Ch id="passkeys">chapter 15</Ch>.</>],
  ['MFA and passwordless', 'How do passkeys work?', <>At registration the device creates a key pair for your site (the relying party) and sends the public key; the server stores it. At sign-in the server sends a random challenge; the device signs it, together with data that includes the origin, after the user unlocks it with a fingerprint, face or PIN. The server verifies the signature with the stored public key, checks the challenge, origin, RP ID and sign counter.</>],
  ['MFA and passwordless', 'How do you make magic links safe?', <>A single-use 256-bit random token stored as a hash with a short expiry (15 minutes), consumed atomically; the same response whether or not the email exists; rate limits per email and IP; and a confirmation step so email link scanners do not consume the token. See <Ch id="magic-links">chapter 16</Ch>.</>],
  ['Machines', 'How do services authenticate to each other?', <>OAuth client credentials (short-lived scoped tokens), workload identity from the platform (cloud metadata tokens, Kubernetes service-account tokens, SPIFFE), or mutual TLS inside a mesh. Avoid long-lived shared secrets where the platform can issue identities. See <Ch id="mtls">chapter 17</Ch>.</>],
  ['Authorization', 'What is broken object level authorization, and how do you prevent it?', <>A signed-in user changes an id in the URL and reads or edits someone else’s object, because the code checked authentication but not ownership. Prevent it by checking ownership (and tenant) on every object, ideally inside the data-access query, and by testing it. It is number one in the OWASP API Security Top 10. See <Ch id="authorization">chapter 18</Ch>.</>],
  ['Authorization', 'RBAC, ABAC or ReBAC?', <>RBAC grants permissions through roles: simple, good for coarse access. ABAC decides with attributes of the user, resource and context (department, time, sensitivity): flexible policies. ReBAC decides by relationships (owner, member of a team that shares the folder), as in Google Zanzibar and OpenFGA: good for sharing models. Many systems combine RBAC with ownership checks.</>],
];

export function Interview() {
  const sections = [...new Set(QUESTIONS.map((q) => q[0]))];
  return (
    <>
      <div className="prose">
        <p>
          The questions interviewers ask most about authentication, grouped by topic. Say each answer out loud before
          you open it; then compare. Each answer links to the chapter that builds it.
        </p>
      </div>
      {sections.map((s) => (
        <section key={s} aria-label={s}>
          <h2>{s}</h2>
          {QUESTIONS.filter((q) => q[0] === s).map(([, q, a]) => (
            <Checkpoint key={q} question={q}>
              <p>{a}</p>
            </Checkpoint>
          ))}
        </section>
      ))}
    </>
  );
}
