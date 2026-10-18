// Ten single-use recovery codes, for the day the phone with the authenticator app is lost. Each code is 10 characters
// from a 32-letter alphabet (50 random bits) and is shown to the user once. NIST SP 800-63B calls them "look-up
// secrets": below 112 bits, each one is stored salted and hashed with a password hashing scheme, with its own salt
// (the salt and the hash are stored for each secret). So every code gets its own random salt and the same slow hash as
// passwords, and checking a typed code means hashing it once per unused code, stopping at the first match.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { COST, slowHash } from './passwords.ts';

export const COUNT = 10;
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford's base32: no i, l, o or u to misread

export type RecoveryCode = { salt: string; hash: string }; // one stored entry per code; the code itself is not kept

/** "7gk2m-x9q4d": the dash is only for reading; it is ignored when the code is typed. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: COUNT }, () => {
    const chars = [...randomBytes(10)].map((b) => ALPHABET[b & 31]).join(''); // 256 is a multiple of 32: no bias
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export const normalize = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');

export async function hashRecoveryCodes(codes: string[], cost = COST): Promise<RecoveryCode[]> {
  const stored: RecoveryCode[] = [];
  for (const code of codes) {
    const salt = randomBytes(16); // a new salt for every code
    stored.push({ salt: salt.toString('base64'), hash: (await slowHash(normalize(code), salt, cost)).toString('base64') });
  }
  return stored;
}

/**
 * True if the typed code is one of the unused ones. That code is removed, so it works once.
 * The caller lets only one request per user run this at a time, so two requests with the same code cannot both succeed.
 */
export async function useRecoveryCode(stored: RecoveryCode[], typed: string, cost = COST): Promise<boolean> {
  const code = normalize(typed);
  for (const [index, entry] of stored.entries()) {
    const hash = await slowHash(code, Buffer.from(entry.salt, 'base64'), cost);
    if (timingSafeEqual(hash, Buffer.from(entry.hash, 'base64'))) {
      stored.splice(index, 1);
      return true;
    }
  }
  return false;
}
