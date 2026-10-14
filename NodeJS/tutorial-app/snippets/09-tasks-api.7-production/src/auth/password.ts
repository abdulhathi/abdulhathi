import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt is deliberately slow and memory-hungry, which makes guessing
// expensive. N = 2^15 costs about 45 ms and 32 MiB per hash on a laptop.
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;

// Runs on libuv's thread pool, so hashing does not block the event loop.
function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  const maxmem = 256 * (options.N ?? 0) * (options.r ?? 8); // room above the 128 * N * r bytes scrypt needs
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { ...options, maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returns "scrypt$N$r$p$salt$hash": everything needed to check the password later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16); // unique per password, so equal passwords get different hashes
  const key = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  // Compares every byte however early they differ, so timing reveals nothing.
  return timingSafeEqual(actual, expected);
}
