// TOTP (RFC 6238) built on HOTP (RFC 4226), written out so you can see every step. Authenticator apps
// (Google Authenticator, Microsoft Authenticator, 1Password and the rest) use these settings: HMAC-SHA1,
// 30-second steps, 6 digits.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const STEP_SECONDS = 30;
export const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32, RFC 4648

/** Base32 without "=" padding: the form an authenticator app expects. Node has no built-in base32. */
export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1; // keep only the bits not written yet
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text.replace(/[\s=-]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error(`Not a base32 character: ${ch}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** HOTP, RFC 4226: an HMAC-SHA1 of an 8-byte counter, cut down to a short number ("dynamic truncation"). */
export function hotp(secret: Uint8Array, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter)); // the counter as 8 bytes, most significant first
  const mac = createHmac('sha1', secret).update(message).digest(); // 20 bytes
  const offset = mac[mac.length - 1] & 0x0f; // the low 4 bits of the last byte say where to read
  const binary = mac.readUInt32BE(offset) & 0x7fffffff; // 4 bytes from there, top bit cleared
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** TOTP, RFC 6238: HOTP where the counter is the number of 30-second steps since 1970. */
export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);
export const totp = (secret: Uint8Array, ms: number, digits = DIGITS) => hotp(secret, stepAt(ms), digits);

/**
 * Checks a typed code against the step before, the current step and the step after (phone clocks drift and people
 * type slowly), and refuses any step at or before the last one used, so each code works once.
 * Returns the step that matched, which the caller saves as the new "last used step", or null.
 */
export function verifyTotp(secret: Uint8Array, code: string, ms: number, lastUsedStep = -1, window = 1): number | null {
  const typed = code.replace(/\s/g, '');
  if (!/^[0-9]{6}$/.test(typed)) return null;
  const now = stepAt(ms);
  let match: number | null = null;
  for (let step = now - window; step <= now + window; step++) {
    // Check every step, comparing in constant time, so the time taken says nothing about which one matched.
    if (timingSafeEqual(Buffer.from(typed), Buffer.from(hotp(secret, step))) && step > lastUsedStep) match = step;
  }
  return match;
}

/** A new shared secret: 160 random bits, the length RFC 4226 recommends for HMAC-SHA1. */
export const newTotpSecret = () => randomBytes(20);

/** The Key URI an authenticator app reads from a QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = `secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  return `otpauth://totp/${label}?${query}`;
}
