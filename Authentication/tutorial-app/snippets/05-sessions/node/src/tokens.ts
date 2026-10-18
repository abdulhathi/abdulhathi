import { randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits as 43 URL-safe characters: used for session ids and CSRF tokens. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** Compares two tokens in constant time. The length is not secret (every token is 43 characters). */
export function sameToken(sent: string, expected: string): boolean {
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}
