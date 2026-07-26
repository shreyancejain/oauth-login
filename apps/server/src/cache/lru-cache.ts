/**
 * Least Recently Used cache backed by Map insertion order.
 * get/set are O(1): refresh recency by delete + reinsert.
 */
export function createLruCache<K, V>(capacity: number) {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error("capacity must be a positive integer");
  }

  const store = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      if (!store.has(key)) {
        return undefined;
      }
      const value = store.get(key)!;
      store.delete(key);
      store.set(key, value);
      return value;
    },

    set(key: K, value: V): void {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= capacity) {
        const oldest = store.keys().next().value as K;
        store.delete(oldest);
      }
      store.set(key, value);
    },

    size(): number {
      return store.size;
    },

    has(key: K): boolean {
      return store.has(key);
    },

    clear(): void {
      store.clear();
    },

    deleteByPrefix(prefix: string): void {
      for (const key of [...store.keys()]) {
        if (typeof key === "string" && key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },
  };
}

export type LruCache<K, V> = ReturnType<typeof createLruCache<K, V>>;
