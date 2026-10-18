// A set of IDs that each expire. The SP keeps two: the AuthnRequest IDs it sent and is waiting on, and the
// assertion IDs it has already accepted (the replay cache). In production keep them in Redis or the database,
// so every server instance shares them.
export class ExpiringIds {
  private ids = new Map<string, number>();
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  add(id: string, expiresAt: number): void {
    for (const [key, until] of this.ids) if (until <= this.now()) this.ids.delete(key); // forget expired ones
    this.ids.set(id, expiresAt);
  }

  has(id: string): boolean {
    const until = this.ids.get(id);
    return until !== undefined && until > this.now();
  }

  /** True once for an ID that is present and not expired; it is removed, so a second call is false. */
  take(id: string): boolean {
    const ok = this.has(id);
    this.ids.delete(id);
    return ok;
  }
}
