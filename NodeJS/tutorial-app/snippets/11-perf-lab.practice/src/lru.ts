type Entry<V> = { value: V; expires: number };

/**
 * A cache that holds at most `max` entries, evicts the least recently used one,
 * and treats entries older than `ttlMs` as missing.
 */
export class LruCache<K, V> {
  #max: number;
  #ttlMs: number;
  #map = new Map<K, Entry<V>>();

  constructor(max: number, ttlMs = Infinity) {
    this.#max = max;
    this.#ttlMs = ttlMs;
  }

  get size() {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    const entry = this.#map.get(key);
    if (entry === undefined) return undefined;
    this.#map.delete(key);
    if (entry.expires <= Date.now()) return undefined; // stale: drop it
    this.#map.set(key, entry); // move to the newest position
    return entry.value;
  }

  set(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, { value, expires: Date.now() + this.#ttlMs });
    if (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value;
      if (oldest !== undefined) this.#map.delete(oldest);
    }
  }
}
