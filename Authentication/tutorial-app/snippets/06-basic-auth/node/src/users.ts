import { COST, hashPassword, verifyPassword } from './passwords.ts';

/** Demo accounts: a person, a CI job whose password has colons, and a name that is not ASCII. */
export const DEMO_USERS: Record<string, string> = {
  ada: 'correct horse battery',
  'ci-bot': 's3cret:with:colons',
  'zoë': 'grüße aus Köln',
};

/** Username -> password hash (chapter 04), and the check every Basic request runs. */
export class UserTable {
  private hashes: Map<string, string>;
  private dummyHash: string;
  private constructor(hashes: Map<string, string>, dummyHash: string) {
    this.hashes = hashes;
    this.dummyHash = dummyHash;
  }

  static async create(users = DEMO_USERS, cost = COST): Promise<UserTable> {
    const hashes = new Map<string, string>();
    for (const [username, password] of Object.entries(users)) hashes.set(username, await hashPassword(password, cost));
    return new UserTable(hashes, await hashPassword('not-a-real-password', cost));
  }

  /** True only for a known user with the right password. Unknown users take as long as known ones. */
  async check(username: string, password: string): Promise<boolean> {
    const stored = this.hashes.get(username);
    const ok = await verifyPassword(password, stored ?? this.dummyHash);
    return stored !== undefined && ok;
  }
}
