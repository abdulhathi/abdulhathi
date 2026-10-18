// Refresh tokens: long-lived, opaque and single-use. Only a SHA-256 hash of each one is stored, so a leaked table
// holds nothing an attacker can present. Each sign-in starts a family; every refresh spends the presented token and
// mints its replacement in the same family.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * DAY_MS; // a token unused for 7 days expires: sign in again
export const FAMILY_TTL_MS = 30 * DAY_MS; // 30 days after sign-in the family ends, however active the user is

// In production these are two database tables, with an index on the hash.
type TokenRecord = { familyId: string; expiresAt: number; usedAt: number | null };
type Family = { userId: string; expiresAt: number; revoked: boolean };

export type Issued = { token: string; expiresAt: number };
export type Failure = 'invalid' | 'reused' | 'expired';
export type Rotated = { ok: true; userId: string; refresh: Issued } | { ok: false; reason: Failure };

/** A fast hash is right here: the token is 256 random bits, so there is nothing to guess (unlike a password). */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class RefreshStore {
  readonly tokens = new Map<string, TokenRecord>(); // key: the token's SHA-256, never the token
  readonly families = new Map<string, Family>();
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** At sign-in: a new family and its first refresh token. */
  issue(userId: string): Issued {
    const familyId = randomUUID();
    this.families.set(familyId, { userId, expiresAt: this.now() + FAMILY_TTL_MS, revoked: false });
    return this.mint(familyId);
  }

  /** At /auth/refresh: spend the presented token and return its replacement. */
  rotate(token: string): Rotated {
    // Check-and-spend must be atomic, so two parallel requests cannot both succeed. Here it is: rotate() never awaits,
    // and Node runs JavaScript on one thread, so no other request can run between the check and the spend. In SQL:
    // UPDATE refresh_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL
    const record = this.tokens.get(hashToken(token));
    const family = record && this.families.get(record.familyId);
    if (!record || !family || family.revoked) return { ok: false, reason: 'invalid' };
    if (record.usedAt !== null) {
      // This token was already exchanged, so two parties hold copies: the user and, probably, a thief. We cannot
      // tell which one is asking, so end the whole family and make both sign in again (RFC 9700, section 4.14).
      family.revoked = true;
      return { ok: false, reason: 'reused' };
    }
    if (this.now() >= record.expiresAt) return { ok: false, reason: 'expired' };
    record.usedAt = this.now();
    return { ok: true, userId: family.userId, refresh: this.mint(record.familyId) };
  }

  /** At /auth/logout: end this sign-in (this family) on this device. */
  revoke(token: string): void {
    const record = this.tokens.get(hashToken(token));
    const family = record && this.families.get(record.familyId);
    if (family) family.revoked = true;
  }

  private mint(familyId: string): Issued {
    const family = this.families.get(familyId)!;
    const token = randomBytes(32).toString('base64url'); // 256 random bits
    // Each token lives 7 days, but never past the family's absolute end.
    const expiresAt = Math.min(this.now() + REFRESH_TTL_MS, family.expiresAt);
    this.tokens.set(hashToken(token), { familyId, expiresAt, usedAt: null });
    return { token, expiresAt };
  }
}
