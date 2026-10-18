// The first factor, as in chapter 04: scrypt from node:crypto with a random salt (shortened: the cost is not stored
// in the hash here). The recovery codes reuse the same slow hash.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const COST = { N: 2 ** 17, r: 8, p: 1 }; // OWASP's minimum for scrypt
export type Cost = typeof COST;

export const slowHash = (secret: string, salt: Buffer, cost: Cost) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(secret, salt, 32, { ...cost, maxmem: 256 * cost.N * cost.r }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string, cost = COST): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('base64')}$${(await slowHash(password, salt, cost)).toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string, cost = COST): Promise<boolean> {
  const [salt, hash] = stored.split('$');
  return timingSafeEqual(await slowHash(password, Buffer.from(salt, 'base64'), cost), Buffer.from(hash, 'base64'));
}
