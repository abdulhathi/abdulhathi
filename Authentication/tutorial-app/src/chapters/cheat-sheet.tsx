import type { ReactNode } from 'react';
import { Code } from '../components/Code';
import { ByStack } from '../components/Stacks';
import { hrefFor } from '../lib/route';

type Entry = { id: string; title: string; checks: ReactNode[]; node: string; python: string; dotnet: string };

const ENTRIES: Entry[] = [
  {
    id: 'passwords', title: 'Passwords',
    checks: ['A slow, salted hash with OWASP settings', 'Constant-time verify; rehash when settings rise', 'One answer for unknown email and wrong password'],
    node: `import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const salt = randomBytes(16);
scrypt(password, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 2 ** 17 * 8 }, (err, hash) => { /* store salt + hash + N,r,p */ });
timingSafeEqual(actual, expected); // when verifying`,
    python: `from argon2 import PasswordHasher
ph = PasswordHasher(memory_cost=19_456, time_cost=2, parallelism=1)  # Argon2id
stored = ph.hash(password)
ph.verify(stored, attempt)          # raises VerificationError on a mismatch
ph.check_needs_rehash(stored)       # True when settings have risen`,
    dotnet: `// Microsoft.Extensions.Identity.Core: PBKDF2-HMAC-SHA512
builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
var stored = hasher.HashPassword(user, password);
var result = hasher.VerifyHashedPassword(user, stored, attempt); // Success | SuccessRehashNeeded | Failed`,
  },
  {
    id: 'sessions', title: 'Cookie sessions and CSRF',
    checks: ['Random id (≥128 bits), new id at sign-in', 'HttpOnly, Secure, SameSite=Lax', 'Idle + absolute timeout; CSRF token on writes'],
    node: `app.use(session({
  name: 'sid', secret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 60 * 1000 },
}));
req.session.regenerate((err) => { req.session.userId = user.id; /* … */ }); // at sign-in`,
    python: `sid = secrets.token_urlsafe(32)          # stored server-side with the user id
response.set_cookie("sid", sid, httponly=True, secure=True, samesite="lax", max_age=1800)
# at sign-in: delete the old session and issue a new sid`,
    dotnet: `builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o => {
        o.Cookie.HttpOnly = true; o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        o.Cookie.SameSite = SameSiteMode.Lax; o.ExpireTimeSpan = TimeSpan.FromMinutes(30); o.SlidingExpiration = true;
    });
await http.SignInAsync(principal);  // and the antiforgery service for state-changing requests`,
  },
  {
    id: 'basic-auth', title: 'HTTP Basic',
    checks: ['TLS only', 'Split at the first colon; decode UTF-8', 'Hashed passwords, constant-time compare; 401 with WWW-Authenticate'],
    node: `const [scheme, value] = (req.headers.authorization ?? '').split(' ');
const decoded = Buffer.from(value ?? '', 'base64').toString('utf8');
const i = decoded.indexOf(':'); const user = decoded.slice(0, i), pass = decoded.slice(i + 1);
res.set('WWW-Authenticate', 'Basic realm="api", charset="UTF-8"').status(401); // on failure`,
    python: `from fastapi.security import HTTPBasic, HTTPBasicCredentials
security = HTTPBasic(realm="api")
def current_user(creds: HTTPBasicCredentials = Depends(security)): ...  # verify the password hash`,
    dotnet: `// No built-in Basic handler: write an AuthenticationHandler<AuthenticationSchemeOptions>
var header = AuthenticationHeaderValue.Parse(Request.Headers.Authorization!);
var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header.Parameter!));
Response.Headers.WWWAuthenticate = "Basic realm=\\"api\\", charset=\\"UTF-8\\""; // in HandleChallengeAsync`,
  },
  {
    id: 'api-keys', title: 'API keys',
    checks: ['Random 256-bit secret with a key id prefix', 'Store only SHA-256; show the key once', 'Scopes, expiry, revocation, rotation; never in URLs'],
    node: `const secret = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(secret).digest();
timingSafeEqual(hash, stored.hash);`,
    python: `secret = secrets.token_urlsafe(32)
digest = hashlib.sha256(secret.encode()).digest()
hmac.compare_digest(digest, stored_digest)`,
    dotnet: `var secret = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
var hash = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
CryptographicOperations.FixedTimeEquals(hash, stored.Hash);`,
  },
  {
    id: 'jwt', title: 'JSON Web Tokens',
    checks: ['Algorithm allowlist; key chosen by kid from your JWKS', 'iss, aud, exp, nbf (small skew), required claims', 'Short lifetime; nothing secret in the payload'],
    node: `import { jwtVerify, SignJWT } from 'jose';
const token = await new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid })
  .setIssuer(ISS).setAudience(AUD).setSubject(id).setIssuedAt().setExpirationTime('10m').sign(privateKey);
const { payload } = await jwtVerify(token, jwks, { issuer: ISS, audience: AUD, algorithms: ['RS256'], clockTolerance: 30 });`,
    python: `import jwt
token = jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})
claims = jwt.decode(token, public_key, algorithms=["RS256"], issuer=ISS, audience=AUD, leeway=30,
                    options={"require": ["exp", "iat", "nbf", "iss", "aud", "sub", "jti"]})`,
    dotnet: `options.TokenValidationParameters = new() {
    ValidAlgorithms = ["RS256"], ValidIssuer = Iss, ValidAudience = Aud,
    ClockSkew = TimeSpan.FromSeconds(30), // the default is 5 minutes
    IssuerSigningKeyResolver = (_, _, kid, _) => ring.Find(kid) is { } k ? [k.PublicKey] : [],
};`,
  },
  {
    id: 'refresh-tokens', title: 'Refresh tokens',
    checks: ['Opaque random token, stored as SHA-256', 'Rotate on every use; reuse revokes the family', 'HttpOnly cookie scoped to the refresh path; revoke on sign-out'],
    node: `const token = randomBytes(32).toString('base64url');
store.save({ hash: sha256(token), family, userId, expiresAt });
// POST /refresh: spend the old row atomically; if it was already spent, revoke the whole family`,
    python: `token = secrets.token_urlsafe(32)
store.save(hash=sha256(token), family=family, user_id=user_id, expires_at=expires_at)
# UPDATE refresh_tokens SET spent = true WHERE hash = ? AND spent = false  -- 0 rows: reuse`,
    dotnet: `var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
store.Save(new(Hash: SHA256.HashData(Encoding.UTF8.GetBytes(token)), Family: family, UserId: userId));
// spend under a lock or a conditional UPDATE; reuse → revoke the family`,
  },
  {
    id: 'hmac', title: 'Signed requests and webhooks',
    checks: ['HMAC over timestamp + RAW body', 'Constant-time compare; reject old timestamps', 'Several secrets during rotation; replay cache'],
    node: `const expected = createHmac('sha256', secret).update(\`\${t}.\`).update(rawBody).digest();
timingSafeEqual(expected, Buffer.from(v1, 'hex'));   // and |now - t| <= 300 seconds`,
    python: `expected = hmac.new(secret, f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
hmac.compare_digest(expected, v1)                    # and abs(now - t) <= 300`,
    dotnet: `var expected = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{t}.").Concat(rawBody).ToArray());
CryptographicOperations.FixedTimeEquals(expected, Convert.FromHexString(v1));`,
  },
  {
    id: 'oauth2', title: 'OAuth 2.0 with PKCE',
    checks: ['Code flow + PKCE (S256); state; exact redirect URI', 'Single-use, short-lived codes', 'Client credentials for machines; no implicit or password grant'],
    node: `const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
// /authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…&code_challenge=…&code_challenge_method=S256`,
    python: `verifier = secrets.token_urlsafe(32)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
# POST /token: grant_type=authorization_code, code, redirect_uri, client_id, code_verifier`,
    dotnet: `var verifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
var challenge = Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
// System.Buffers.Text.Base64Url is new in .NET 9`,
  },
  {
    id: 'oidc', title: 'OpenID Connect',
    checks: ['Validate the ID token: signature via JWKS, iss, aud = client id, exp', 'Check the nonce you sent; check state', 'Use discovery; cache the JWKS, refresh on unknown kid'],
    node: `const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
const { payload } = await jwtVerify(idToken, jwks, { issuer: discovery.issuer, audience: clientId });
if (payload.nonce !== expectedNonce) throw new Error('bad nonce');`,
    python: `key = jwt.PyJWKClient(discovery["jwks_uri"]).get_signing_key_from_jwt(id_token)
claims = jwt.decode(id_token, key.key, algorithms=["RS256"], issuer=discovery["issuer"], audience=client_id)
assert claims["nonce"] == expected_nonce`,
    dotnet: `builder.Services.AddAuthentication(o => { o.DefaultScheme = "Cookies"; o.DefaultChallengeScheme = "oidc"; })
    .AddCookie("Cookies")
    .AddOpenIdConnect("oidc", o => { o.Authority = authority; o.ClientId = clientId; o.ClientSecret = secret;
        o.ResponseType = "code"; o.UsePkce = true; o.Scope.Add("email"); }); // validates nonce and state for you`,
  },
  {
    id: 'saml', title: 'SAML 2.0',
    checks: ['Verify the signature with the IdP certificate from metadata (not KeyInfo)', 'Read the user only from the signed element', 'Issuer, Audience, Recipient, NotBefore/NotOnOrAfter, InResponseTo, one-time assertion id; no DTDs'],
    node: `const sig = new SignedXml({ publicCert: idpCert });
sig.loadSignature(signatureNode.toString());
if (!sig.checkSignature(xml)) throw new Error('Invalid signature.');
const [signed] = sig.getSignedReferences();   // read the user from these bytes only`,
    python: `parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
result = XMLVerifier().verify(xml, x509_cert=idp_cert, parser=parser)
signed = result.signed_xml                    # read the user from this element only`,
    dotnet: `var doc = new XmlDocument { PreserveWhitespace = true, XmlResolver = null };
var signed = new SignedXml(doc); signed.LoadXml(signatureElement);
if (!signed.CheckSignature(idpCert, verifySignatureOnly: true)) throw …;
// then prove the single Reference points at the assertion you read`,
  },
  {
    id: 'mfa', title: 'TOTP and recovery codes',
    checks: ['160-bit secret, encrypted at rest; confirm the first code', '±1 step window; remember the last step used', 'Ten single-use recovery codes, stored hashed'],
    node: `import { Secret, TOTP } from 'otpauth';
const totp = new TOTP({ issuer: 'Auth Lab', label: email, secret: Secret.fromBase32(secret) });
const delta = totp.validate({ token: code, window: 1 });   // null when wrong
totp.toString();                                          // the otpauth:// URI for the QR code`,
    python: `import pyotp
totp = pyotp.TOTP(secret)
totp.verify(code, valid_window=1)
totp.provisioning_uri(name=email, issuer_name="Auth Lab")`,
    dotnet: `using OtpNet;
var totp = new Totp(Base32Encoding.ToBytes(secret));
var ok = totp.VerifyTotp(code, out long step, new VerificationWindow(previous: 1, future: 1)); // reject step <= last used`,
  },
  {
    id: 'passkeys', title: 'Passkeys (WebAuthn)',
    checks: ['Single-use, expiring challenges kept on the server', 'Expected origin and RP ID; user verification required', 'Store credential id, public key, sign count; reject a count that goes backwards'],
    node: `import { generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
const v = await verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID,
  credential, requireUserVerification: true });`,
    python: `from webauthn import generate_registration_options, verify_registration_response, verify_authentication_response
v = verify_authentication_response(credential=body, expected_challenge=challenge, expected_origin=ORIGIN,
    expected_rp_id=RP_ID, credential_public_key=stored.public_key,
    credential_current_sign_count=stored.sign_count, require_user_verification=True)`,
    dotnet: `// Fido2NetLib (package Fido2.AspNet)
var options = fido2.RequestNewCredential(new RequestNewCredentialParams { User = user, /* … */ });
var created = await fido2.MakeNewCredentialAsync(new MakeNewCredentialParams { /* response, options, … */ });
var asserted = await fido2.MakeAssertionAsync(new MakeAssertionParams { /* response, options, stored key, count */ });`,
  },
  {
    id: 'magic-links', title: 'Magic links and email codes',
    checks: ['Same answer whether or not the email exists', '256-bit single-use token, stored hashed, 15-minute expiry', 'Rate limits; confirm on a POST so link scanners do not spend it'],
    node: `const token = randomBytes(32).toString('base64url');
store.set(sha256(token), { email, expiresAt: now + 15 * 60_000 });
// GET /auth/verify shows a confirm page; POST spends the token atomically`,
    python: `token = secrets.token_urlsafe(32)
store[sha256(token)] = LinkRecord(email=email, expires_at=now + 900)
# consume: pop the record, then check expiry`,
    dotnet: `var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
store.TryAdd(Sha256(token), new(email, now.AddMinutes(15)));
// consume with TryRemove so a token works exactly once`,
  },
  {
    id: 'mtls', title: 'Mutual TLS',
    checks: ['Trust only your CA, not the system roots', 'Require the certificate in the handshake', 'Map fingerprint or subject to a known client; plan rotation'],
    node: `https.createServer({ key, cert, ca: caCert, requestCert: true, rejectUnauthorized: true }, app);
const fingerprint = (req.socket as TLSSocket).getPeerCertificate().fingerprint256;`,
    python: `ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH, cafile="ca.pem")
ctx.verify_mode = ssl.CERT_REQUIRED
ctx.load_cert_chain("server.pem", "server.key.pem")`,
    dotnet: `builder.WebHost.ConfigureKestrel(k => k.ConfigureHttpsDefaults(h => h.ClientCertificateMode = ClientCertificateMode.RequireCertificate));
builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme).AddCertificate(o => {
    o.ChainTrustValidationMode = X509ChainTrustMode.CustomRootTrust; o.CustomTrustStore.Add(caCert);
});`,
  },
  {
    id: 'authorization', title: 'Authorization',
    checks: ['401 unauthenticated, 403 forbidden, 404 to hide existence', 'Ownership and tenant checks on every read and write', 'Scopes for clients, roles and policies for people'],
    node: `app.get('/documents/:id', requireScope('documents:read'), (req, res) => {
  const doc = documents.find(req.params.id, res.locals.user.tenantId);   // tenant in the query
  if (!doc || !canRead(res.locals.user, doc)) return res.status(404).json({ error: 'Not found.' });
});`,
    python: `@app.get("/documents/{doc_id}")
def read(doc_id: str, user: User = Depends(require_scope("documents:read"))):
    doc = documents.find(doc_id, tenant_id=user.tenant_id)
    if doc is None or not can_read(user, doc): raise NotFound()`,
    dotnet: `builder.Services.AddAuthorizationBuilder()
    .AddPolicy("documents:read", p => p.RequireClaim("scope", "documents:read"));
var result = await auth.AuthorizeAsync(user, doc, "CanEdit");   // resource-based check per object`,
  },
];

export function CheatSheet() {
  return (
    <>
      <div className="prose">
        <p>
          One entry per method: the checks you must not skip, and the key calls in your stack. Each title links to the
          chapter with the full, tested project. The snippets are reminders, not complete programs.
        </p>
      </div>
      {ENTRIES.map((e) => (
        <section key={e.id} aria-label={e.title}>
          <h2>
            <a href={hrefFor(e.id)}>{e.title}</a>
          </h2>
          <ul className="prose">
            {e.checks.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <ByStack
            label={`${e.title} in each stack`}
            node={<Code title="Node.js" lang="typescript">{e.node}</Code>}
            python={<Code title="Python" lang="python">{e.python}</Code>}
            dotnet={<Code title=".NET" lang="csharp">{e.dotnet}</Code>}
          />
        </section>
      ))}
    </>
  );
}
