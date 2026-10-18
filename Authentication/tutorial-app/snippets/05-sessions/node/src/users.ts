import { COST, hashPassword, verifyPassword } from './passwords.ts';

/** Two demo accounts so you can try the API. A real app signs users up (chapter 04) and keeps them in a database. */
export const DEMO_USERS = [
  { email: 'ada@example.com', password: 'correct horse battery' },
  { email: 'bo@example.com', password: 'purple monkey dishwasher' },
];

/** Email -> password hash, and the sign-in check from chapter 04. */
export class UserTable {
  private hashes: Map<string, string>;
  private dummyHash: string;
  private constructor(hashes: Map<string, string>, dummyHash: string) {
    this.hashes = hashes;
    this.dummyHash = dummyHash;
  }

  static async create(list = DEMO_USERS, cost = COST): Promise<UserTable> {
    const hashes = new Map<string, string>();
    for (const u of list) hashes.set(u.email, await hashPassword(u.password, cost));
    return new UserTable(hashes, await hashPassword('not-a-real-password', cost));
  }

  /** The normalized email if the password is right, otherwise null. Unknown emails take as long as known ones. */
  async check(email: string, password: string): Promise<string | null> {
    const key = email.trim().toLowerCase();
    const stored = this.hashes.get(key);
    const ok = await verifyPassword(password, stored ?? this.dummyHash);
    return stored && ok ? key : null;
  }
}
