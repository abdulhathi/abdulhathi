// Password hashing with scrypt from node:crypto: slow on purpose, salted, and memory-hard.
// Stored format: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>, so the cost can rise later without breaking old hashes.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scryptAsync = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));

// OWASP's minimum for scrypt is N=2^17, r=8, p=1 (about 128 MiB per hash).
export const COST = { N: 2 ** 17, r: 8, p: 1 };
const KEYLEN = 32;
const maxmem = (N: number, r: number) => 256 * N * r; // scrypt needs 128 * N * r bytes; leave room

export async function hashPassword(password: string, cost = COST): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, { ...cost, maxmem: maxmem(cost.N, cost.r) });
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: maxmem(Number(N), Number(r)),
  });
  // Compare every byte, whatever the first difference: the time taken reveals nothing.
  return timingSafeEqual(actual, expected);
}

/** True when the stored hash used weaker settings than today's, so it should be replaced at the next sign-in. */
export function needsRehash(stored: string, cost = COST): boolean {
  const [scheme, N, r, p] = stored.split('$');
  return scheme !== 'scrypt' || Number(N) < cost.N || Number(r) < cost.r || Number(p) < cost.p;
}

const COMMON = new Set(['password1234', '123456789012', 'qwertyuiop12', 'letmein12345', 'iloveyou1234']);

/** NIST SP 800-63B style: long enough, not absurdly long, not a known-common password. No composition rules. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (COMMON.has(password.toLowerCase())) return 'That password is too common. Choose another.';
  return null;
}
