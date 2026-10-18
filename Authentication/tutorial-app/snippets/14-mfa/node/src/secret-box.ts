// Encrypts TOTP secrets before they are stored. The server needs the secret itself to compute codes, so it cannot be
// hashed like a password; instead it is encrypted with AES-256-GCM under a key that lives outside the database.
// Each value gets a fresh 12-byte nonce, and the user's email is bound in as "associated data", so a secret copied
// onto another user's row fails to decrypt. Stored form: v1.<base64url(nonce | ciphertext | 16-byte tag)>.
// "v1" names the key, so a new key can be introduced later and old values re-encrypted.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE = 12;
const TAG = 16;

export class SecretBox {
  private readonly key: Buffer;
  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('The encryption key must be 32 bytes (AES-256).');
    this.key = key;
  }

  seal(plaintext: Uint8Array, associatedData: string): string {
    const nonce = randomBytes(NONCE);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: TAG });
    cipher.setAAD(Buffer.from(associatedData));
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return `v1.${Buffer.concat([nonce, body, cipher.getAuthTag()]).toString('base64url')}`;
  }

  /** Throws if the value, the associated data or the key is not the one it was sealed with. */
  open(stored: string, associatedData: string): Buffer {
    const [version, data] = stored.split('.');
    if (version !== 'v1' || !data) throw new Error('Unknown secret format.');
    const raw = Buffer.from(data, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, NONCE), { authTagLength: TAG });
    decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(raw.subarray(raw.length - TAG));
    return Buffer.concat([decipher.update(raw.subarray(NONCE, raw.length - TAG)), decipher.final()]);
  }
}
