// Issuing and checking access tokens with jose. Every check is explicit: the algorithm, the issuer, the audience,
// the time claims (with a small clock skew) and the claims that must be present.
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { ALG, type KeyRing } from './keys.ts';

export const ISSUER = 'https://auth.example.com'; // who made the token
export const AUDIENCE = 'https://api.example.com'; // which API it is for
export const LIFETIME_S = 10 * 60; // access tokens live 10 minutes
export const CLOCK_SKEW_S = 30; // tolerate clocks that are up to 30 seconds apart
const REQUIRED = ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'];

export type User = { id: string; email: string };

export async function issueAccessToken(ring: KeyRing, user: User, now: () => number = Date.now): Promise<string> {
  const t = Math.floor(now() / 1000); // JWT times are whole seconds since 1970 (NumericDate)
  const key = ring.current;
  return new SignJWT({ email: user.email }) // never put secrets here: anyone can read the payload
    .setProtectedHeader({ alg: ALG, typ: 'JWT', kid: key.kid })
    .setIssuer(ISSUER)
    .setSubject(user.id) // a stable ID that is never reused, not the email
    .setAudience(AUDIENCE)
    .setIssuedAt(t)
    .setNotBefore(t)
    .setExpirationTime(t + LIFETIME_S)
    .setJti(randomUUID()) // a unique ID for this token, for logs and deny-lists
    .sign(key.privateKey);
}

export async function verifyAccessToken(ring: KeyRing, token: string, now: () => number = Date.now): Promise<JWTPayload> {
  const { payload } = await jwtVerify(
    token,
    // Choose the verification key by the token's kid. An unknown kid fails; never fall back to "any key".
    (header) => {
      const key = ring.find(header.kid);
      if (!key) throw new Error('Unknown signing key');
      return key.publicKey;
    },
    {
      algorithms: [ALG], // the allowlist: "none", HS256 and everything else is refused
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: REQUIRED,
      clockTolerance: CLOCK_SKEW_S,
      currentDate: new Date(now()),
    },
  );
  return payload;
}
