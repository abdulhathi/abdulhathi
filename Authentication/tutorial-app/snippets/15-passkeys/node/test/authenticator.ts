// A software authenticator for the tests: it does what a phone, laptop or security key does, in one short file.
// It makes an EC P-256 key pair, builds clientDataJSON (what the browser adds), authenticatorData (what the
// authenticator signs) and a "none" attestation object in CBOR, and signs assertions with the private key.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

// --- A tiny CBOR encoder (RFC 8949): unsigned and negative integers, byte strings, text strings and maps. ---
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

export function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value, 'utf8')]);
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest();
const b64url = (data: Buffer | Uint8Array) => Buffer.from(data).toString('base64url');

// authenticatorData flags (WebAuthn Level 3, section 6.1)
const UP = 0x01; // user present: someone touched or confirmed
const UV = 0x04; // user verified: biometrics or PIN
const BE = 0x08; // backup eligible: a synced passkey
const BS = 0x10; // backup state: it is backed up now
const AT = 0x40; // attested credential data follows

/** Change one thing to make a response the server must reject. */
export type Tamper = {
  origin?: string; // the page's origin, as the browser writes it
  rpId?: string; // the RP ID whose hash starts authenticatorData
  challenge?: string;
  up?: boolean; // false: clear the user-present flag
  uv?: boolean; // false: clear the user-verified flag
  synced?: boolean; // set or clear the backup flags (BE and BS), whatever this authenticator is
  signCount?: number;
  userHandle?: string; // the account the passkey claims to belong to
  signWith?: KeyObject;
};

type CreationOptions = { challenge: string; rp: { id?: string }; user: { id: string } };
type RequestOptions = { challenge: string; rpId?: string };

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  signCount = 0;
  private userHandle = '';
  private synced: boolean;
  private origin: string;
  constructor({ origin = 'http://localhost:3000', synced = false } = {}) {
    this.origin = origin;
    this.synced = synced; // synced passkeys set BE and BS and always report a sign count of 0
  }

  /** What navigator.credentials.create() returns, as JSON. */
  register(options: CreationOptions, t: Tamper = {}) {
    this.userHandle = options.user.id; // a discoverable credential remembers which account it belongs to
    const clientDataJSON = this.clientData('webauthn.create', t.challenge ?? options.challenge, t.origin);
    const authData = this.authData(t.rpId ?? options.rp.id ?? 'localhost', AT, 0, t, this.attestedCredentialData());
    const attestationObject = cbor(new Map<Cbor, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(attestationObject), transports: ['hybrid', 'internal'] },
    };
  }

  /** What navigator.credentials.get() returns, as JSON: a signature over authenticatorData || SHA-256(clientDataJSON). */
  login(options: RequestOptions, t: Tamper = {}) {
    if (!this.synced) this.signCount += 1;
    const clientDataJSON = this.clientData('webauthn.get', t.challenge ?? options.challenge, t.origin);
    const authData = this.authData(t.rpId ?? options.rpId ?? 'localhost', 0, t.signCount ?? this.signCount, t);
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), t.signWith ?? this.keys.privateKey); // DER, as WebAuthn expects
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authData), signature: b64url(signature), userHandle: t.userHandle ?? this.userHandle },
    };
  }

  // The browser writes this, not the page: the page cannot lie about its own origin.
  private clientData(type: string, challenge: string, origin = this.origin): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  // rpIdHash (32) | flags (1) | signCount (4, big-endian) | attested credential data (registration only)
  private authData(rpId: string, extraFlags: number, signCount: number, t: Tamper, attested: Buffer = Buffer.alloc(0)): Buffer {
    const flags = (t.up === false ? 0 : UP) | (t.uv === false ? 0 : UV) | ((t.synced ?? this.synced) ? BE | BS : 0) | extraFlags;
    const count = Buffer.alloc(4);
    count.writeUInt32BE(signCount);
    return Buffer.concat([sha256(rpId), Buffer.from([flags]), count, attested]);
  }

  // AAGUID (16, zeros: "unknown model") | credential ID length (2) | credential ID | public key as a COSE_Key
  private attestedCredentialData(): Buffer {
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    const coseKey = new Map<Cbor, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Buffer.from(jwk.x!, 'base64url')], // x
      [-3, Buffer.from(jwk.y!, 'base64url')], // y
    ]);
    const idLength = Buffer.from([this.credentialId.length >> 8, this.credentialId.length & 0xff]);
    return Buffer.concat([Buffer.alloc(16), idLength, this.credentialId, cbor(coseKey)]);
  }
}
