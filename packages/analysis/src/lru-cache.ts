/**
 * Small LRU cache used by analysis internals for synthetic compiler results.
 *
 * @internal
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  public constructor(private readonly maxEntries: number) {}

  public get(key: K): V | undefined {
    const cached = this.map.get(key);
    if (cached === undefined) {
      return undefined;
    }

    this.map.delete(key);
    this.map.set(key, cached);
    return cached;
  }

  public set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);

    if (this.map.size <= this.maxEntries) {
      return;
    }

    const oldestKey = this.map.keys().next().value;
    if (oldestKey !== undefined) {
      this.map.delete(oldestKey);
    }
  }
}
