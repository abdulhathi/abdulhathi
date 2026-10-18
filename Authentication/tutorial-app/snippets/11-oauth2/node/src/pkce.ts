// PKCE (RFC 7636) and the random values OAuth needs. Used by both the client and the authorization server.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A random, URL-safe string: 32 bytes give 43 characters. Used for codes, state and verifiers. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** The code_verifier: a fresh secret for every authorization request, kept by the client until the callback. */
export const newVerifier = () => randomToken(32);

/** The S256 code_challenge: BASE64URL(SHA-256(code_verifier)), sent in the authorization request. */
export const challengeFor = (verifier: string) => createHash('sha256').update(verifier, 'ascii').digest('base64url');

/** RFC 7636 section 4.1: 43 to 128 characters from the unreserved set. */
export const VERIFIER_FORMAT = /^[A-Za-z0-9\-._~]{43,128}$/;

export const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex');

/** Compares two strings in constant time. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
