// A tiny OpenID Connect provider for the lab: discovery, JWKS, authorize, token (with an RS256 ID token), UserInfo
// and RP-initiated logout. It stands in for Microsoft Entra ID, Google, Okta or Keycloak; never use it for real.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { calculateJwkThumbprint, compactVerify, exportJWK, generateKeyPair, SignJWT } from 'jose';

export const CODE_TTL_S = 60;
export const TOKEN_TTL_S = 300;
export const TEST_USER = { sub: 'u-1001', name: 'Ada Example', email: 'ada@example.com', email_verified: true };

/** A client registered at the provider. */
export type IdpClient = { id: string; secretHash: string; redirectUris: string[]; postLogoutRedirectUris: string[] };
/** What the mock can be told to get wrong, so the tests can prove the relying party notices. */
export type Misbehavior = 'none' | 'wrong-nonce' | 'wrong-audience' | 'expired' | 'wrong-issuer' | 'unknown-kid' | 'bad-signature';

type CodeGrant = { clientId: string; redirectUri: string; codeChallenge: string; nonce?: string; scope: string; authTime: number; expiresAt: number };

const randomToken = () => randomBytes(32).toString('base64url');
const sha256 = (text: string, encoding: 'hex' | 'base64url') => createHash('sha256').update(text).digest(encoding);
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const oauthError = (error: string, description: string) => ({ error, error_description: description });
const param = (source: unknown, name: string) => {
  const value = (source as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
};
const withParams = (uri: string, params: Record<string, string | undefined>) =>
  uri + (uri.includes('?') ? '&' : '?') +
  Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export async function createMockIdp({ issuer, clients }: { issuer: string; clients: IdpClient[] }) {
  // The signing key is made at start-up; its kid is its RFC 7638 thumbprint, so a new key always gets a new kid.
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const rogue = await generateKeyPair('RS256'); // never published: for the unknown-kid and bad-signature tests
  const { n, e } = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint({ kty: 'RSA', n, e });
  const jwks = { keys: [{ kty: 'RSA', n, e, kid, use: 'sig', alg: 'RS256' }] }; // public parts only

  const settings = { misbehave: 'none' as Misbehavior }; // test hook: makes the next ID tokens wrong in one way
  const codes = new Map<string, CodeGrant>();
  const accessTokens = new Map<string, { sub: string; scope: string; expiresAt: number }>();
  const router = express.Router();

  router.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      end_session_endpoint: `${issuer}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: ['sub', 'name', 'email', 'email_verified'],
    });
  });

  router.get('/jwks', (_req, res) => res.json(jwks));

  router.get('/authorize', (req: Request, res: Response) => {
    const q = (name: string) => param(req.query, name);
    const client = clients.find((c) => c.id === q('client_id'));
    // Until the client and redirect_uri are known to be good, never redirect: show the error here instead.
    if (!client) return res.status(400).json(oauthError('invalid_request', 'Unknown client_id.'));
    const redirectUri = q('redirect_uri');
    if (!client.redirectUris.includes(redirectUri)) {
      return res.status(400).json(oauthError('invalid_request', 'redirect_uri is not registered for this client.'));
    }
    const state = q('state');
    const fail = (error: string, description: string) =>
      res.redirect(302, withParams(redirectUri, { error, error_description: description, state }));
    if (q('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
    if (!q('scope').split(' ').includes('openid')) return fail('invalid_scope', 'The openid scope is required.');
    if (!q('code_challenge') || q('code_challenge_method') !== 'S256') return fail('invalid_request', 'PKCE with S256 is required.');

    // A real provider shows its sign-in page here (and remembers the user in its own session cookie).
    // To keep the flow to one request, this one signs in the test user straight away.
    const code = randomToken();
    codes.set(code, {
      clientId: client.id,
      redirectUri,
      codeChallenge: q('code_challenge'),
      nonce: q('nonce') || undefined,
      scope: q('scope'),
      authTime: Math.floor(Date.now() / 1000),
      expiresAt: Date.now() + CODE_TTL_S * 1000,
    });
    res.redirect(302, withParams(redirectUri, { code, state }));
  });

  /** The ID token: a signed statement that this user signed in, for this client, just now. */
  const idToken = (grant: CodeGrant, clientId: string) => {
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: issuer, sub: TEST_USER.sub, aud: clientId, exp: now + TOKEN_TTL_S, iat: now, auth_time: grant.authTime, nonce: grant.nonce,
    };
    let key = privateKey;
    let keyId = kid;
    switch (settings.misbehave) {
      case 'wrong-nonce': claims.nonce = 'not-the-nonce-you-sent'; break;
      // Issued to another app; azp names this one, which must not be enough to accept it.
      case 'wrong-audience': claims.aud = 'another-app'; claims.azp = clientId; break;
      case 'expired': claims.iat = now - 900; claims.exp = now - 600; break;
      case 'wrong-issuer': claims.iss = 'https://evil.example.com'; break;
      case 'unknown-kid': key = rogue.privateKey; keyId = 'unknown-key'; break;
      // A forgery: the real kid, but a signature made with a key the provider never published.
      case 'bad-signature': key = rogue.privateKey; break;
    }
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' }).sign(key);
  };

  /** client_secret_basic (an Authorization: Basic header) or client_secret_post (fields in the form). */
  const authenticateClient = (req: Request) => {
    let id = param(req.body, 'client_id');
    let secret = param(req.body, 'client_secret');
    const basic = /^Basic (.+)$/i.exec(req.get('authorization') ?? '');
    if (basic) {
      const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon < 0) return undefined;
      try {
        [id, secret] = [decoded.slice(0, colon), decoded.slice(colon + 1)].map((s) => decodeURIComponent(s.replace(/\+/g, ' ')));
      } catch {
        return undefined; // a broken %-escape
      }
    }
    const client = clients.find((c) => c.id === id);
    return client && secret && safeEqual(sha256(secret, 'hex'), client.secretHash) ? client : undefined;
  };

  router.post('/token', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const f = (name: string) => param(req.body, name);
    if (f('grant_type') !== 'authorization_code') return res.status(400).json(oauthError('unsupported_grant_type', 'Only authorization_code is supported.'));
    const client = authenticateClient(req);
    if (!client) {
      res.set('WWW-Authenticate', 'Basic realm="token"');
      return res.status(401).json(oauthError('invalid_client', 'Client authentication failed.'));
    }
    // Single use: the code leaves the store before any other check.
    const saved = codes.get(f('code'));
    codes.delete(f('code'));
    if (!saved || saved.expiresAt <= Date.now()) return res.status(400).json(oauthError('invalid_grant', 'The code is invalid, expired or already used.'));
    if (saved.clientId !== client.id) return res.status(400).json(oauthError('invalid_grant', 'The code was issued to another client.'));
    if (saved.redirectUri !== f('redirect_uri')) return res.status(400).json(oauthError('invalid_grant', 'redirect_uri does not match the authorization request.'));
    const verifier = f('code_verifier');
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier) || !safeEqual(sha256(verifier, 'base64url'), saved.codeChallenge)) {
      return res.status(400).json(oauthError('invalid_grant', 'code_verifier does not match the code_challenge.'));
    }
    const accessToken = randomToken(); // opaque: only this provider can read it, at the UserInfo endpoint
    accessTokens.set(accessToken, { sub: TEST_USER.sub, scope: saved.scope, expiresAt: Date.now() + TOKEN_TTL_S * 1000 });
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: TOKEN_TTL_S, id_token: await idToken(saved, client.id), scope: saved.scope });
  });

  router.get('/userinfo', (req: Request, res: Response) => {
    const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '');
    const grant = bearer ? accessTokens.get(bearer[1]) : undefined;
    if (!grant || grant.expiresAt <= Date.now()) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json(oauthError('invalid_token', 'The access token is invalid or expired.'));
    }
    // Only the claims the granted scopes allow.
    const scopes = grant.scope.split(' ');
    res.json({
      sub: grant.sub,
      ...(scopes.includes('profile') && { name: TEST_USER.name }),
      ...(scopes.includes('email') && { email: TEST_USER.email, email_verified: TEST_USER.email_verified }),
    });
  });

  /** RP-initiated logout: end the provider's session, then send the browser back to a registered address. */
  router.get('/logout', async (req: Request, res: Response) => {
    const q = (name: string) => param(req.query, name);
    let clientId = q('client_id');
    if (q('id_token_hint')) {
      // The hint must be one of our own ID tokens. It may have expired: that is fine for a logout.
      try {
        const { payload } = await compactVerify(q('id_token_hint'), publicKey);
        const claims = JSON.parse(new TextDecoder().decode(payload));
        if (claims.iss !== issuer) throw new Error('wrong issuer');
        clientId ||= Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
      } catch {
        return res.status(400).json(oauthError('invalid_request', 'id_token_hint is not valid.'));
      }
    }
    // A real provider clears its own session cookie here, and may ask "Sign out of all apps?"
    const target = q('post_logout_redirect_uri');
    if (!target) return res.json({ message: 'Signed out of the identity provider.' });
    const client = clients.find((c) => c.id === clientId);
    if (!client?.postLogoutRedirectUris.includes(target)) {
      return res.status(400).json(oauthError('invalid_request', 'post_logout_redirect_uri is not registered.'));
    }
    res.redirect(302, withParams(target, { state: q('state') }));
  });

  return { router, settings };
}
