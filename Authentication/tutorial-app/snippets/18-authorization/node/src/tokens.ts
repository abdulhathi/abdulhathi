// Who is calling? A small HS256 JWT carries the user's id, tenant, roles, department and the token's scopes.
// Signing in and issuing real tokens is covered in chapters 04 to 12; here the tests and server.ts sign them.
import { jwtVerify, SignJWT } from 'jose';

export const ISSUER = 'auth-lab';
export const AUDIENCE = 'documents-api';
/** What the first-party app's tokens may do. A third-party client may get less, such as 'documents:read'. */
export const FULL_ACCESS = 'documents:read documents:write';

export type Claims = { sub: string; tenant: string; roles: string[]; department: string };
export type User = { id: string; tenant: string; roles: string[]; department: string; scopes: string[] };

/** Signs a token for one user. `exp` is in seconds since 1970; the default is one hour from now. */
export function signToken(key: Uint8Array, claims: Claims, scope = FULL_ACCESS, exp?: number): Promise<string> {
  const { sub, ...rest } = claims;
  return new SignJWT({ ...rest, scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(key);
}

/** The user a valid token describes, or null for a missing, forged, expired or malformed token. */
export async function verifyToken(key: Uint8Array, token: string): Promise<User | null> {
  try {
    // No clock skew is allowed, and exp is required: jose checks exp only when the token has one.
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, requiredClaims: ['exp'] });
    const { sub, tenant, roles, department, scope } = payload;
    // Every claim the rules read must be there: a missing tenant must never mean "no tenant, so everything".
    const text = (v: unknown): v is string => typeof v === 'string' && v !== '';
    if (!text(sub) || !text(tenant) || !text(department) || !text(scope) || !Array.isArray(roles)) return null;
    return { id: sub, tenant, roles: roles.map(String), department, scopes: scope.split(' ') };
  } catch {
    return null;
  }
}
