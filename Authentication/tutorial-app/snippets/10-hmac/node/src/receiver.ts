// The receiving side: check the Webhook-Signature header against the raw body, the timestamp, and a replay cache.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const TOLERANCE_SECONDS = 5 * 60;

export type Rejection = { status: number; error: string };

/** "t=1792238400,v1=ab12...,v1=cd34..." -> { timestamp, signatures }, or null if it is not in that shape. */
export function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, ...rest] = part.trim().split('=');
    const value = rest.join('='); // everything after the first '=', so "t=1=2" is refused, not read as t=1
    if (key === 't' && /^[0-9]{1,12}$/.test(value)) timestamp = Number(value); // Unix seconds, of a sane length
    else if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  return timestamp !== null && signatures.length > 0 ? { timestamp, signatures } : null;
}

export class WebhookVerifier {
  private secrets: string[];
  private now: () => number;
  private seen = new Map<string, number>(); // digest of "<t>.<body>" -> when it can be forgotten (unix seconds)
  constructor(secrets: string[], now: () => number = Date.now) {
    this.secrets = secrets; // every active secret: the new one and, while rotating, the old one
    this.now = now;
  }

  /** Returns null when the webhook is genuine and new, or the reason to reject it. */
  verify(header: string | undefined, body: Buffer): Rejection | null {
    if (!header) return { status: 400, error: 'Missing Webhook-Signature header.' };
    const parsed = parseSignatureHeader(header);
    if (!parsed) return { status: 400, error: 'Malformed Webhook-Signature header.' };

    // A captured request can be replayed, so only accept recent ones (both directions, to allow for clock skew).
    const now = Math.floor(this.now() / 1000);
    if (Math.abs(now - parsed.timestamp) > TOLERANCE_SECONDS) return { status: 400, error: 'Timestamp outside the tolerance window.' };

    const signed = Buffer.concat([Buffer.from(`${parsed.timestamp}.`), body]);
    const matches = this.secrets.some((secret) => {
      const expected = createHmac('sha256', secret).update(signed).digest();
      // Constant time: the time taken says nothing about how many bytes of a forged signature were right.
      return parsed.signatures.some((sig) => timingSafeEqual(expected, Buffer.from(sig, 'hex')));
    });
    if (!matches) return { status: 400, error: 'Signature does not match.' };

    // Within the window, the same timestamp and body twice is a replay. Key on what was signed, not on the header:
    // an attacker could resend the header with one of its two v1 values removed.
    for (const [key, until] of this.seen) if (until < now) this.seen.delete(key);
    const digest = createHash('sha256').update(signed).digest('hex');
    if (this.seen.has(digest)) return { status: 409, error: 'This delivery was already received.' };
    this.seen.set(digest, parsed.timestamp + TOLERANCE_SECONDS);
    return null;
  }
}
