// A key ring for RS256. The newest key signs new tokens; older keys stay published, so the tokens they signed still
// verify, until they are retired. Keys are generated at start-up and never written to disk: a real issuer keeps its
// private keys in a key vault or HSM.
import { calculateJwkThumbprint, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';

export const ALG = 'RS256';

export type SigningKey = { kid: string; privateKey: CryptoKey; publicKey: CryptoKey; publicJwk: JWK };

export async function newSigningKey(): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { modulusLength: 2048 });
  const { kty, n, e } = await exportJWK(publicKey);
  // The key ID is the key's RFC 7638 thumbprint (a SHA-256 of its public parts), so it can never clash.
  const kid = await calculateJwkThumbprint({ kty, n, e });
  return { kid, privateKey, publicKey, publicJwk: { kty, use: 'sig', alg: ALG, kid, n, e } };
}

export class KeyRing {
  private keys: SigningKey[];
  private constructor(first: SigningKey) {
    this.keys = [first];
  }

  static async create(): Promise<KeyRing> {
    return new KeyRing(await newSigningKey());
  }

  /** The key that signs new tokens: the newest one. */
  get current(): SigningKey {
    return this.keys[this.keys.length - 1];
  }

  /** The key with this ID, or undefined if the ring never had it or has retired it. */
  find(kid: string | undefined): SigningKey | undefined {
    return this.keys.find((k) => k.kid === kid);
  }

  /** Start signing with a new key. Older keys keep verifying the tokens they already signed. */
  async rotate(): Promise<SigningKey> {
    const key = await newSigningKey();
    this.keys.push(key);
    return key;
  }

  /** Stop trusting a key. Do this once every token it signed has expired. */
  retire(kid: string): void {
    this.keys = this.keys.filter((k) => k.kid !== kid);
  }

  /** The JSON Web Key Set served at /.well-known/jwks.json: public keys only. */
  jwks(): { keys: JWK[] } {
    return { keys: this.keys.map((k) => k.publicJwk) };
  }
}
