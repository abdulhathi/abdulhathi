// Password hashing with scrypt, exactly as in chapter 04 (trimmed to hash and verify).
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scryptAsync = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));

export const COST = { N: 2 ** 17, r: 8, p: 1 }; // OWASP's minimum for scrypt
const maxmem = (N: number, r: number) => 256 * N * r;

export async function hashPassword(password: string, cost = COST): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32, { ...cost, maxmem: maxmem(cost.N, cost.r) });
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: maxmem(Number(N), Number(r)),
  });
  return timingSafeEqual(actual, expected);
}
