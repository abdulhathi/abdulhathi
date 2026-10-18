// Pending email sign-ins. Each one holds a link token and a 6-digit code, and the database keeps neither: only a
// SHA-256 hash of the token (256 random bits cannot be guessed, so a fast hash is enough) and a keyed hash (HMAC) of
// the code (a million possible codes would fall to a plain hash in a second, so the key, kept outside the database,
// is what protects it).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const TTL_MS = 15 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
// Wrong codes in a row for one address, across all its emails. Without this, an attacker who keeps asking for
// emails gets 5 more guesses with each one, for ever. NIST SP 800-63B allows at most 100; lower is better.
export const MAX_FAILED_CODES = 20;

export type Pending = {
  email: string;
  tokenHash: string;
  codeHash: Buffer;
  browserHash: string; // which browser asked: see sameBrowser()
  expiresAt: number;
  attempts: number;
};

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export class MagicLinks {
  readonly byToken = new Map<string, Pending>(); // like a table with a unique index on token_hash
  readonly byEmail = new Map<string, Pending>(); // the latest request for each email, for codes
  private readonly failedCodes = new Map<string, number>(); // email -> wrong codes in a row
  private readonly now: () => number;
  private readonly codeKey: Buffer; // with several servers, share one key from configuration
  constructor(now: () => number = Date.now, codeKey: Buffer = randomBytes(32)) {
    this.now = now;
    this.codeKey = codeKey;
  }

  /** A new link token and code for this email. Any earlier ones stop working. */
  issue(email: string, browser: string): { token: string; code: string } {
    const old = this.byEmail.get(email);
    if (old) this.remove(old);
    const token = randomBytes(32).toString('base64url'); // 256 bits
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pending: Pending = {
      email, tokenHash: sha256(token), codeHash: this.hmac(email, code), browserHash: sha256(browser),
      expiresAt: this.now() + TTL_MS, attempts: 0,
    };
    this.byToken.set(pending.tokenHash, pending);
    this.byEmail.set(email, pending);
    return { token, code };
  }

  /** The pending sign-in for a link, if it is still valid, without using it up (for the confirmation page). */
  peek(token: string): Pending | null {
    const pending = this.byToken.get(sha256(token));
    return pending && pending.expiresAt > this.now() ? pending : null;
  }

  /** Uses up a link: returns its email the first time, and null ever after. */
  consume(token: string): string | null {
    const pending = this.byToken.get(sha256(token));
    if (!pending) return null;
    // Removed before anything else, with no await in between, so a second request finds nothing. In SQL this is one
    // statement: DELETE FROM magic_links WHERE token_hash = $1 AND expires_at > now() RETURNING email.
    this.remove(pending);
    if (pending.expiresAt <= this.now()) return null;
    this.failedCodes.delete(pending.email); // the real user signed in: codes work again
    return pending.email;
  }

  /**
   * Checks an emailed code. A right code is used up; five wrong ones use it up too. After MAX_FAILED_CODES wrong
   * codes in a row, codes stop working for this address until it signs in with a link (links still work).
   */
  checkCode(email: string, code: string): boolean {
    const pending = this.byEmail.get(email);
    if (!pending || pending.expiresAt <= this.now()) return false;
    const failed = this.failedCodes.get(email) ?? 0;
    if (failed >= MAX_FAILED_CODES) return false;
    if (timingSafeEqual(this.hmac(email, code.replace(/\s/g, '')), pending.codeHash)) {
      this.remove(pending);
      this.failedCodes.delete(email);
      return true;
    }
    this.failedCodes.set(email, failed + 1);
    pending.attempts += 1;
    if (pending.attempts >= MAX_CODE_ATTEMPTS) this.remove(pending);
    return false;
  }

  /** True when the request comes from the browser that asked for the email (it carries that browser's cookie). */
  sameBrowser(pending: Pending, browser: string | undefined): boolean {
    return browser !== undefined && sha256(browser) === pending.browserHash;
  }

  private hmac(email: string, code: string): Buffer {
    return createHmac('sha256', this.codeKey).update(`${email}:${code}`).digest();
  }

  private remove(pending: Pending): void {
    this.byToken.delete(pending.tokenHash);
    if (this.byEmail.get(pending.email) === pending) this.byEmail.delete(pending.email);
  }
}
