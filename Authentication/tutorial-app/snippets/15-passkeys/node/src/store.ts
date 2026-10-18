// What the server keeps: users, their passkeys (public keys only), and the challenges it has handed out.
// A real app uses database tables for the first two and Redis or a table with an expiry for the third.
export type User = { id: string; username: string }; // id: random bytes (base64url), never the email

export type Credential = {
  id: string; // the credential ID, base64url
  userId: string;
  publicKey: Uint8Array; // a COSE key; never secret
  counter: number; // the signature counter from the last sign-in
  transports: string[]; // how the browser reached the authenticator: internal, hybrid, usb, nfc, ble
  deviceType: 'singleDevice' | 'multiDevice'; // device-bound, or synced (backup eligible)
  backedUp: boolean;
};

export type Ceremony = 'registration' | 'authentication';
type Pending = { ceremony: Ceremony; user?: User; expiresAt: number };

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Challenges are random, stored on the server, short-lived, and single-use. */
export class Challenges {
  private pending = new Map<string, Pending>();
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** The library makes the challenge (32 random bytes); we keep it until the response comes back. */
  remember(challenge: string, ceremony: Ceremony, user?: User): void {
    this.pending.set(challenge, { ceremony, user, expiresAt: this.now() + CHALLENGE_TTL_MS });
  }

  /** Removes the challenge whatever happens next, so a response can never be verified twice. */
  take(challenge: string, ceremony: Ceremony): Pending | undefined {
    const p = this.pending.get(challenge);
    this.pending.delete(challenge);
    if (!p || p.ceremony !== ceremony || p.expiresAt <= this.now()) return undefined;
    return p;
  }
}

export class Store {
  users = new Map<string, User>(); // by id
  credentials = new Map<string, Credential>(); // by credential ID

  findUserByName(username: string): User | undefined {
    for (const u of this.users.values()) if (u.username === username) return u;
    return undefined;
  }

  credentialsOf(userId: string): Credential[] {
    return [...this.credentials.values()].filter((c) => c.userId === userId);
  }
}
