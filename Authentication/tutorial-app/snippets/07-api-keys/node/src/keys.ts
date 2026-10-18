// API keys: random, prefixed, shown once, stored only as a SHA-256 hash, and looked up by their id.
// Format: ak_live_<id>_<secret>   id: 12 hex characters (not secret)   secret: 32 random bytes, base64url
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PREFIX = 'ak_live_';
export const SCOPES: readonly string[] = ['reports:read', 'keys:manage'];
export const DEFAULT_TTL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
export const ROTATION_GRACE_MS = DAY_MS; // after a rotation the old key keeps working for 24 hours
const FORMAT = /^ak_live_([0-9a-f]{12})_[A-Za-z0-9_-]{43}$/;

export type ApiKey = {
  id: string;
  name: string; // what the key is for, such as "nightly-export"
  hash: string; // SHA-256 of the whole key, in hex. Never the key itself.
  scopes: string[];
  createdAt: number;
  expiresAt: number;
  lifetimeDays: number; // the lifetime it was issued with; a rotation gives the new key the same
  revokedAt: number | null;
  lastUsedAt: number | null;
};

export type Verified = { ok: true; key: ApiKey } | { ok: false; error: string };

// A fast hash is right here: the key holds 256 random bits, so there is no list of likely keys to try.
export const hashKey = (key: string) => createHash('sha256').update(key).digest();

export class KeyStore {
  private keys = new Map<string, ApiKey>(); // a real app uses a table with id as the primary key
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Makes a new key. The plain key is returned here, once, and never stored. */
  issue(name: string, scopes: string[], ttlDays = DEFAULT_TTL_DAYS): { record: ApiKey; key: string } {
    let id: string;
    do id = randomBytes(6).toString('hex');
    while (this.keys.has(id));
    const key = `${PREFIX}${id}_${randomBytes(32).toString('base64url')}`; // randomBytes is a CSPRNG
    const now = this.now();
    const record: ApiKey = {
      id, name, hash: hashKey(key).toString('hex'), scopes: [...scopes],
      createdAt: now, expiresAt: now + ttlDays * DAY_MS, lifetimeDays: ttlDays, revokedAt: null, lastUsedAt: null,
    };
    this.keys.set(id, record);
    return { record, key };
  }

  get(id: string): ApiKey | undefined {
    return this.keys.get(id);
  }

  verify(presented: string): Verified {
    const actual = hashKey(presented);
    const id = FORMAT.exec(presented)?.[1];
    const record = id ? this.keys.get(id) : undefined;
    // Look up by id, then compare the hashes in constant time. An unknown id and a wrong secret get the same answer.
    if (!record || !timingSafeEqual(actual, Buffer.from(record.hash, 'hex'))) return { ok: false, error: 'Invalid API key.' };
    // Only now that the caller has proved they hold the key do we say why it no longer works.
    if (record.revokedAt !== null) return { ok: false, error: 'This API key has been revoked.' };
    if (this.now() >= record.expiresAt) return { ok: false, error: 'This API key has expired.' };
    record.lastUsedAt = this.now(); // shows which keys are unused and safe to delete
    return { ok: true, key: record };
  }

  revoke(id: string): ApiKey | undefined {
    const record = this.keys.get(id);
    if (record && record.revokedAt === null) record.revokedAt = this.now();
    return record;
  }

  /** A new key with the same name, scopes and lifetime. The old key stays valid for the grace period, then expires. */
  rotate(old: ApiKey, graceMs = ROTATION_GRACE_MS): { record: ApiKey; key: string } {
    const fresh = this.issue(old.name, old.scopes, old.lifetimeDays);
    old.expiresAt = Math.min(old.expiresAt, this.now() + graceMs);
    return fresh;
  }
}
