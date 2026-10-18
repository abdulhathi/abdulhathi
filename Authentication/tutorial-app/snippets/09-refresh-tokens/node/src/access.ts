// Access tokens: short-lived JWTs, validated as in chapter 08. This API issues and checks its own tokens, so HS256
// with one random 256-bit secret is enough; switch to chapter 08's RS256 key ring once other services verify them.
import { randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

export const ISSUER = 'https://auth.example.com';
export const AUDIENCE = 'https://api.example.com';
export const ACCESS_TTL_S = 10 * 60; // 10 minutes: the longest a stolen access token stays useful

export const newSecret = (): Uint8Array => new Uint8Array(randomBytes(32));

export type User = { id: string; email: string };

export function issueAccessToken(secret: Uint8Array, user: User, now: () => number = Date.now): Promise<string> {
  const t = Math.floor(now() / 1000);
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setSubject(user.id)
    .setAudience(AUDIENCE)
    .setIssuedAt(t)
    .setExpirationTime(t + ACCESS_TTL_S)
    .setJti(randomUUID())
    .sign(secret);
}

export async function verifyAccessToken(secret: Uint8Array, token: string, now: () => number = Date.now): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
    requiredClaims: ['sub', 'exp', 'iat', 'jti'],
    clockTolerance: 30,
    currentDate: new Date(now()),
  });
  return payload;
}

/**
 * Access tokens that must stop working before they expire, by jti. Every request now pays a lookup, which is what
 * JWTs were meant to avoid, so keep the list small: an entry can go as soon as its token would have expired anyway.
 * In production, keep it in Redis with a TTL so every server instance sees it.
 */
export class DenyList {
  private entries = new Map<string, number>(); // jti -> exp (seconds)
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  add(jti: string, exp: number): void {
    this.entries.set(jti, exp);
    for (const [id, until] of this.entries) if (until * 1000 < this.now()) this.entries.delete(id);
  }

  has(jti: string): boolean {
    return this.entries.has(jti);
  }
}
