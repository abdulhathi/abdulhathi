// A deliberately small OAuth 2.0 authorization server: GET /authorize and POST /token (RFC 6749, RFC 7636).
// It exists to show what a real one checks. In production use Keycloak, Microsoft Entra ID, Okta, Auth0 or similar.
import express, { type Request, type Response } from 'express';
import { SignJWT } from 'jose';
import { CLIENTS, type Client, type Grant } from './clients.ts';
import { challengeFor, randomToken, safeEqual, sha256Hex, VERIFIER_FORMAT } from './pkce.ts';

export const CODE_TTL_S = 60; // codes are short-lived and single-use
export const TOKEN_TTL_S = 600;
export const AUDIENCE = 'photo-api'; // the resource server these access tokens are for
const TEST_USER = 'u-1001';

type CodeGrant = { clientId: string; redirectUri: string; codeChallenge: string; scope: string; sub: string; expiresAt: number };
/** revoked: the jti of every access token that must no longer work. The resource server checks it too. */
type Options = { issuer: string; signingKey: CryptoKey; now: () => number; revoked: Set<string> };

const oauthError = (error: string, description: string) => ({ error, error_description: description });
const SCOPE_ERROR = 'The requested scope is invalid or not allowed for this client.';

/** Adds query parameters to a URI, percent-encoding every value. */
function withParams(uri: string, params: Record<string, string | undefined>): string {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return uri + (uri.includes('?') ? '&' : '?') + query;
}

/** One value per parameter: RFC 6749 says a parameter must not appear twice. */
const param = (source: unknown, name: string): string => {
  const value = (source as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
};

/** Splits "a b" into scopes; true when every one is allowed for the client. */
const scopesAllowed = (scope: string, client: Client) => {
  const asked = scope.split(' ').filter(Boolean);
  return asked.length > 0 && asked.every((s) => client.scopes.includes(s));
};

/** Undoes the form encoding of client_secret_basic; undefined for a broken %-escape instead of an exception. */
function formDecode(s: string): string | undefined {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

/** client_secret_basic (an Authorization: Basic header) or client_secret_post (fields in the form). */
function authenticateClient(req: Request): Client | undefined {
  let id = param(req.body, 'client_id');
  let secret: string | undefined = param(req.body, 'client_secret') || undefined;
  const basic = /^Basic (.+)$/i.exec(req.get('authorization') ?? '');
  if (basic) {
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 0) return undefined;
    const [basicId, basicSecret] = [formDecode(decoded.slice(0, colon)), formDecode(decoded.slice(colon + 1))];
    if (basicId === undefined || basicSecret === undefined) return undefined;
    [id, secret] = [basicId, basicSecret];
  }
  const client = CLIENTS.find((c) => c.id === id);
  if (!client) return undefined;
  if (!client.secretHash) return client; // a public client has no secret to check
  return secret !== undefined && safeEqual(sha256Hex(secret), client.secretHash) ? client : undefined;
}

export function authorizationServer({ issuer, signingKey, now, revoked }: Options) {
  const codes = new Map<string, CodeGrant>(); // a real server uses a shared store with expiry (Redis, a table)
  // Codes already redeemed, with the jti of the token each one gave, kept as long as that token lives.
  const usedCodes = new Map<string, { jti: string; expiresAt: number }>();
  const router = express.Router();

  router.get('/authorize', (req: Request, res: Response) => {
    const q = (name: string) => param(req.query, name);
    const client = CLIENTS.find((c) => c.id === q('client_id') && c.grants.includes('authorization_code'));
    // Until the client and redirect_uri are known to be good, never redirect: show the error here instead.
    if (!client) return res.status(400).json(oauthError('invalid_request', 'Unknown client_id.'));
    const redirectUri = q('redirect_uri');
    if (!client.redirectUris.includes(redirectUri)) {
      return res.status(400).json(oauthError('invalid_request', 'redirect_uri is not registered for this client.'));
    }
    const state = q('state') || undefined;
    // Every response that goes back to the client carries iss (RFC 9207), so the client can tell which server sent it.
    const fail = (error: string, description: string) =>
      res.redirect(302, withParams(redirectUri, { error, error_description: description, state, iss: issuer }));

    if (q('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
    if (!q('code_challenge') || q('code_challenge_method') !== 'S256') return fail('invalid_request', 'PKCE with S256 is required.');
    if (!scopesAllowed(q('scope'), client)) return fail('invalid_scope', SCOPE_ERROR);

    // A real server now shows its sign-in page, then a consent screen ("photo-app wants to read your photos").
    // To keep the flow to one request, this one signs in the test user straight away.
    const code = randomToken();
    codes.set(code, {
      clientId: client.id,
      redirectUri,
      codeChallenge: q('code_challenge'),
      scope: q('scope'),
      sub: TEST_USER,
      expiresAt: now() + CODE_TTL_S * 1000,
    });
    res.redirect(302, withParams(redirectUri, { code, state, iss: issuer }));
  });

  /** Signs an access token; returns it with its jti, the id that lets the server revoke it later. */
  const accessToken = async (sub: string, clientId: string, scope: string) => {
    const iat = Math.floor(now() / 1000);
    const jti = randomToken(16);
    // A JWT access token in the shape of RFC 9068: typ "at+jwt", so it cannot be mistaken for an ID token.
    const token = await new SignJWT({ client_id: clientId, scope })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt' })
      .setIssuer(issuer)
      .setSubject(sub)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + TOKEN_TTL_S)
      .setJti(jti)
      .sign(signingKey);
    return { token, jti };
  };

  router.post('/token', express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store'); // tokens must never be cached
    const grant = param(req.body, 'grant_type') as Grant;
    // The implicit and password grants are not offered: RFC 9700 says not to use them.
    if (grant !== 'authorization_code' && grant !== 'client_credentials') {
      return res.status(400).json(oauthError('unsupported_grant_type', 'Use authorization_code or client_credentials.'));
    }
    const client = authenticateClient(req);
    if (!client) {
      res.set('WWW-Authenticate', 'Basic realm="token"');
      return res.status(401).json(oauthError('invalid_client', 'Client authentication failed.'));
    }
    if (!client.grants.includes(grant)) {
      return res.status(400).json(oauthError('unauthorized_client', 'This client may not use this grant type.'));
    }

    if (grant === 'client_credentials') {
      const scope = param(req.body, 'scope') || client.scopes.join(' ');
      if (!scopesAllowed(scope, client)) return res.status(400).json(oauthError('invalid_scope', SCOPE_ERROR));
      // No user is involved: the client is the subject. No refresh token either (RFC 6749 section 4.4.3).
      const { token } = await accessToken(client.id, client.id, scope);
      return res.json({ access_token: token, token_type: 'Bearer', expires_in: TOKEN_TTL_S, scope });
    }

    const code = param(req.body, 'code');
    // A code that was already redeemed has leaked: refuse it and revoke the token it gave (RFC 6749 section 4.1.2).
    const used = usedCodes.get(code);
    if (used) {
      usedCodes.delete(code);
      if (used.expiresAt > now()) revoked.add(used.jti);
      return res.status(400).json(oauthError('invalid_grant', 'The code is invalid, expired or already used.'));
    }
    // authorization_code: take the code out of the store first, so it is used up even if a check below fails.
    const saved = codes.get(code);
    codes.delete(code);
    if (!saved || saved.expiresAt <= now()) {
      return res.status(400).json(oauthError('invalid_grant', 'The code is invalid, expired or already used.'));
    }
    if (saved.clientId !== client.id) return res.status(400).json(oauthError('invalid_grant', 'The code was issued to another client.'));
    if (saved.redirectUri !== param(req.body, 'redirect_uri')) {
      return res.status(400).json(oauthError('invalid_grant', 'redirect_uri does not match the authorization request.'));
    }
    const verifier = param(req.body, 'code_verifier');
    if (!VERIFIER_FORMAT.test(verifier) || !safeEqual(challengeFor(verifier), saved.codeChallenge)) {
      return res.status(400).json(oauthError('invalid_grant', 'code_verifier does not match the code_challenge.'));
    }
    const { token, jti } = await accessToken(saved.sub, client.id, saved.scope);
    usedCodes.set(code, { jti, expiresAt: now() + TOKEN_TTL_S * 1000 });
    res.json({ access_token: token, token_type: 'Bearer', expires_in: TOKEN_TTL_S, scope: saved.scope });
  });

  return router;
}
