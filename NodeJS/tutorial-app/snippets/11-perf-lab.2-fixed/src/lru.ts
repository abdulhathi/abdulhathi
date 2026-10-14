/** A cache that holds at most `max` entries and evicts the least recently used one. */
export class LruCache<K, V> {
  #max: number;
  #map = new Map<K, V>(); // a Map keeps insertion order, so its first key is the oldest

  constructor(max: number) {
    this.#max = max;
  }

  get size() {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) {
      // Move the entry to the newest position.
      this.#map.delete(key);
      this.#map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value;
      if (oldest !== undefined) this.#map.delete(oldest);
    }
  }
}
