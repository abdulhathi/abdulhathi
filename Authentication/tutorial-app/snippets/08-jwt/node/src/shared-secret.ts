// HS256: one shared secret both signs and verifies. It suits a single service that issues and checks its own
// tokens. It does not suit tokens other services verify: every service holding the secret could also forge tokens.
import { randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { AUDIENCE, CLOCK_SKEW_S, ISSUER, LIFETIME_S } from './tokens.ts';

/** At least 256 random bits (RFC 7518 section 3.2). In production, load it from a secret store. */
export const newSecret = (): Uint8Array => new Uint8Array(randomBytes(32));

export function signHs256(sub: string, secret: Uint8Array): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setSubject(sub)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${LIFETIME_S}s`)
    .sign(secret);
}

export async function verifyHs256(token: string, secret: Uint8Array): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
    requiredClaims: ['exp', 'sub'], // jose checks exp only when it is present
    clockTolerance: CLOCK_SKEW_S,
  });
  return payload;
}
