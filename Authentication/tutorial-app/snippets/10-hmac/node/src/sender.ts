// The sending side of a webhook: sign the exact bytes you send, with a timestamp inside the signature.
// Header: Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">[,v1=<another secret's signature>]
import { createHmac, randomBytes } from 'node:crypto';

/** A new shared secret, generated once and given to the receiver over a safe channel (a settings page, a vault). */
export const newSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;

/** HMAC-SHA256 over "<timestamp>.<body>", in hex. The timestamp is signed too, so it cannot be changed. */
export function sign(secret: string, timestamp: number, body: string | Buffer): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

/** One v1 signature per active secret, so the receiver can rotate secrets without missing a delivery. */
export function signatureHeader(secrets: string[], timestamp: number, body: string | Buffer): string {
  return [`t=${timestamp}`, ...secrets.map((s) => `v1=${sign(s, timestamp, body)}`)].join(',');
}

/** Sends one webhook: serialize once, sign those exact bytes, and POST them. */
export function deliver(url: string, event: unknown, secrets: string[], now: () => number = Date.now): Promise<Response> {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(now() / 1000);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Webhook-Signature': signatureHeader(secrets, timestamp, body) },
    body,
  });
}
